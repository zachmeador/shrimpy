import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, existsSync } from "node:fs";
import { uptime } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import type { CommitPublication, ConversationId, Extension, Harness, ToolExecutionApi } from "@earendil-works/pi-durable";
import type { ProcessOutput, ProcessSummary } from "../../contracts/agent/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { type FollowAttach, follow } from "../../lib/follow/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { homePaths } from "../home/index.ts";
import type { Breadcrumb, ProcessEvent } from "../inputs/index.ts";
import { copyOf, ProcessesDoc, SessionsDoc, type StoredProcess, threadOfSession } from "../records/durable.ts";
import { takeUp, type TurnTask } from "../turns/durable.ts";
import {
  DEFAULT_TAIL_LINES,
  MAX_SYNC_LINES,
  MAX_TAIL_BYTES,
  MAX_WAKE_TAIL_BYTES,
  MAX_WAKE_TAIL_LINES,
  openProcessLog,
  pruneProcessLogs,
  readLogDelta,
  readLogTail,
  removeProcessLog,
} from "./logs.ts";
import { processTools } from "./tools.durable.ts";

const context = BACKGROUND_CONTEXT;

/** Built-in sync wait before `bash` auto-backgrounds in the same turn (60 seconds). */
export const DEFAULT_SYNC_WAIT_MS = 60_000;
/** Built-in one-time hang check-in for background processes (15 minutes). */
export const DEFAULT_CHECKIN_MS = 15 * 60_000;
/** How often a sync command polls its log file to stream output into Agent's View. */
const STREAM_POLL_MS = 120;
/** How often a process recovered across an agent restart is polled for liveness. */
const RECOVERY_POLL_MS = 500;
/** Grace period after SIGTERM before escalating to SIGKILL on a process group. */
const KILL_ESCALATE_MS = 2_000;
const BOOT_SLACK_MS = 5_000;

export interface ProcessesOptions {
  home: string;
  shellEnv: NodeJS.ProcessEnv | undefined;
  turn: TurnTask;
  breadcrumbs(): Promise<readonly Breadcrumb[]>;
  onError(error: Error): void;
  /** Override sync wait before auto-backgrounding (tests shorten this). */
  syncWaitMs?: number;
  /** Override built-in check-in delay (tests shorten this). */
  checkinMs?: number;
}

/** Outcome of `bash` execution inside the manager. */
export type RunResult =
  | {
      kind: "exited";
      exitCode: number;
      output: string;
      truncated: boolean;
      logPath?: string;
    }
  | {
      kind: "backgrounded";
      id: string;
      auto: boolean;
      output: string;
      truncated: boolean;
      logPath: string;
    };

/** What the agent's process manager exposes to tools, `served.ts`, and `agent/index.ts`. */
export interface Processes {
  readonly extension: Extension;
  list(): Promise<ProcessSummary[]>;
  readonly listed: FollowAttach<ProcessSummary[]>;
  /** Read the output tail of a running or recently finished process. Refuses unknown IDs. */
  output(id: string, lines?: number): Promise<ProcessOutput>;
  /** Kill a running background process from UI or `/kill`: posts `killed` wake line and wakes the session. */
  kill(id: string): Promise<void>;
  /** Recover persisted background processes after startup (detecting dead ones as `interrupted`). */
  recover(): Promise<void>;
  /** Clean up in-memory timers and pollers when the agent shuts down. */
  close(): void;
}

/** Internal handle used by the `bash` and `process` tools. */
export interface ProcessRuntime {
  run(command: string, background: boolean, api: ToolExecutionApi, at: Context): Promise<RunResult>;
  list(): Promise<StoredProcess[]>;
  read(id: string, lines?: number): Promise<ProcessOutput | undefined>;
  input(id: string, input: { text?: string; eof: boolean }): Promise<{ ok: true } | { problem: string }>;
  killFromTool(id: string): Promise<{ ok: true; output: string; truncated: boolean } | { problem: string }>;
}

interface LiveHandle {
  child?: ChildProcess;
  pgid: number;
  checkinTimer?: ReturnType<typeof setTimeout>;
  recoveryPoll?: ReturnType<typeof setInterval>;
}

export function createProcesses(harness: Harness, options: ProcessesOptions): Processes {
  const logDir = homePaths(options.home).processes;
  const syncWaitMs = options.syncWaitMs ?? DEFAULT_SYNC_WAIT_MS;
  const checkinMs = options.checkinMs ?? DEFAULT_CHECKIN_MS;

  const live = new Map<string, LiveHandle>();
  const suppressed = new Set<string>();
  let closed = false;

  const envForShell = (): NodeJS.ProcessEnv => ({
    ...process.env,
    ...(options.shellEnv ?? {}),
  });

  const storedMap = async (): Promise<Record<string, StoredProcess>> =>
    (await harness.snapshot(ProcessesDoc, context))?.running ?? {};

  const listStored = async (): Promise<StoredProcess[]> =>
    Object.values(await storedMap()).sort((a, b) => a.startedAt - b.startedAt);

  const list = async (): Promise<ProcessSummary[]> =>
    (await listStored()).map(({ id, threadId, command, startedAt }) => ({ id, threadId, command, startedAt }));

  const clearTimers = (id: string): void => {
    const handle = live.get(id);
    if (handle === undefined) return;
    if (handle.checkinTimer !== undefined) clearTimeout(handle.checkinTimer);
    if (handle.recoveryPoll !== undefined) clearInterval(handle.recoveryPoll);
    handle.checkinTimer = undefined;
    handle.recoveryPoll = undefined;
  };

  /** Wake the owning session for a background process event and optionally remove it from `ProcessesDoc`. */
  const emitEvent = async (
    proc: StoredProcess,
    state: ProcessEvent["state"],
    code: number | null,
    remove: boolean,
  ): Promise<void> => {
    if (closed) return;
    const now = Date.now();
    const tail = readLogTail(proc.logPath, { maxLines: MAX_WAKE_TAIL_LINES, maxBytes: MAX_WAKE_TAIL_BYTES });
    const event: ProcessEvent = {
      eventId: state === "checkin" ? `${proc.id}:checkin` : proc.id,
      id: proc.id,
      command: proc.command,
      state,
      code,
      startedAt: proc.startedAt,
      at: now,
      afterMs: Math.max(0, now - proc.startedAt),
      output: tail.output,
      ...(tail.truncated ? { outputTruncated: true as const } : {}),
      logPath: proc.logPath,
    };
    const crumbs = await options.breadcrumbs();
    await harness.commit(async (tx) => {
      const doc = await tx.doc(ProcessesDoc);
      if (!Object.hasOwn(doc.running, proc.id)) return;
      if (state === "checkin") {
        if (doc.running[proc.id]!.checkedIn) return;
        doc.running[proc.id]!.checkedIn = true;
      }
      if (remove) doc.running = without(doc.running, proc.id);
      const sessions = (await tx.doc(SessionsDoc)).sessions;
      const session = Object.hasOwn(sessions, proc.threadId) ? sessions[proc.threadId] : undefined;
      if (session === undefined) return;
      await takeUp(
        tx,
        options.turn,
        session.conversationId as ConversationId,
        {
          process: event,
          threadId: proc.threadId,
          channelId: proc.channelId,
        },
        crumbs,
      );
    }, context);
  };

  const armCheckin = (proc: StoredProcess, handle: LiveHandle): void => {
    if (proc.checkedIn || closed) return;
    const remaining = Math.max(0, proc.startedAt + checkinMs - Date.now());
    const timer = setTimeout(() => {
      if (closed || suppressed.has(proc.id)) return;
      handle.checkinTimer = undefined;
      void emitEvent(proc, "checkin", null, false).catch((error: unknown) => {
        if (!closed) options.onError(new Error(`Process check-in for ${proc.id} failed: ${asError(error).message}`));
      });
    }, remaining);
    timer.unref();
    handle.checkinTimer = timer;
  };

  const attachBackground = (proc: StoredProcess, child: ChildProcess): void => {
    const handle: LiveHandle = { child, pgid: proc.pgid };
    live.set(proc.id, handle);
    child.unref();
    (child.stdin as unknown as { unref?: () => void } | null)?.unref?.();
    armCheckin(proc, handle);

    const onEnd = (code: number | null): void => {
      clearTimers(proc.id);
      live.delete(proc.id);
      if (suppressed.delete(proc.id) || closed) return;
      void emitEvent(proc, "exited", code, true).catch((error: unknown) => {
        if (!closed) options.onError(new Error(`Process exit handling for ${proc.id} failed: ${asError(error).message}`));
      });
    };
    child.once("close", (code) => onEnd(code));
    child.once("error", () => onEnd(null));
  };

  const persistBackground = async (proc: StoredProcess, api: ToolExecutionApi, at: Context): Promise<void> => {
    await api.commit(async (tx) => {
      const doc = await tx.doc(ProcessesDoc);
      doc.running[proc.id] = proc;
    }, at);
    const running = await storedMap();
    pruneProcessLogs(logDir, new Set(Object.keys(running)));
  };

  const killGroup = (pgid: number): void => {
    try {
      process.kill(-pgid, "SIGTERM");
    } catch {
      return;
    }
    const timer = setTimeout(() => {
      try {
        process.kill(-pgid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }, KILL_ESCALATE_MS);
    timer.unref();
  };

  const killGroupNow = async (pgid: number): Promise<void> => {
    try {
      process.kill(-pgid, "SIGTERM");
    } catch {
      return;
    }
    const deadline = Date.now() + 500;
    while (Date.now() < deadline) {
      if (!isGroupAlive(pgid)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    try {
      process.kill(-pgid, "SIGKILL");
    } catch {
      // Already gone.
    }
  };

  const runtime: ProcessRuntime = {
    async run(command, background, api, at) {
      const thread = await threadOfSession(api, api.conversationId, at);
      if (thread === undefined) {
        throw new Error("The session is not one the agent keeps, so background commands have nowhere to report.");
      }

      // If this call was already promoted to background before a crash, return its ID without spawning again.
      const existingId = await api.memo<string>("procId", at);
      if (existingId !== undefined) {
        const logPath = join(logDir, `${existingId}.log`);
        const tail = readLogTail(logPath, { maxLines: DEFAULT_TAIL_LINES, maxBytes: MAX_TAIL_BYTES });
        return { kind: "backgrounded", id: existingId, auto: !background, output: tail.output, truncated: tail.truncated, logPath };
      }

      const id = newId("proc");
      const { logPath, fd } = openProcessLog(logDir, id);
      let child: ChildProcess;
      try {
        child = spawn("/bin/sh", ["-c", command], {
          cwd: options.home,
          env: envForShell(),
          detached: true,
          stdio: [background ? "pipe" : "ignore", fd, fd],
        });
      } catch (error) {
        closeSync(fd);
        removeProcessLog(logPath);
        throw error;
      }
      // Child inherited the duplicated fd; close parent's copy immediately.
      closeSync(fd);
      child.stdin?.on("error", () => undefined);
      const pid = child.pid;
      if (pid === undefined) {
        removeProcessLog(logPath);
        throw new Error("Failed to start shell command.");
      }
      const startedAt = Date.now();
      const proc: StoredProcess = {
        id,
        pid,
        pgid: pid,
        threadId: thread.threadId,
        channelId: thread.channelId,
        command,
        startedAt,
        logPath,
      };

      if (background) {
        await api.memo("procId", id, at);
        await persistBackground(proc, api, at);
        attachBackground(proc, child);
        return { kind: "backgrounded", id, auto: false, output: "", truncated: false, logPath };
      }

      // Sync mode: wait up to `syncWaitMs`, streaming output to `api.output`, aborting child on signal, or auto-backgrounding.
      return new Promise<RunResult>((resolve, reject) => {
        let settled = false;
        let offset = 0;

        const flushDelta = (): void => {
          const next = readLogDelta(logPath, offset);
          if (next.text !== "") {
            offset = next.offset;
            api.output(next.text);
          }
        };

        const poller = setInterval(flushDelta, STREAM_POLL_MS);
        poller.unref();

        const cleanup = (): void => {
          clearInterval(poller);
          clearTimeout(waitTimer);
          at.abortSignal?.removeEventListener("abort", onAbort);
        };

        const onAbort = (): void => {
          if (settled) return;
          settled = true;
          cleanup();
          void killGroupNow(pid).finally(() => {
            removeProcessLog(logPath);
            reject(new Error("Command aborted"));
          });
        };

        const finishSync = (exitCode: number): void => {
          if (settled) return;
          settled = true;
          cleanup();
          flushDelta();
          const tail = readLogTail(logPath, { maxLines: MAX_SYNC_LINES, maxBytes: MAX_TAIL_BYTES });
          if (!tail.truncated) removeProcessLog(logPath);
          resolve({
            kind: "exited",
            exitCode,
            output: tail.output,
            truncated: tail.truncated,
            ...(tail.truncated ? { logPath } : {}),
          });
        };

        const waitTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          flushDelta();
          void (async () => {
            try {
              await api.memo("procId", id, at);
              await persistBackground(proc, api, at);
              attachBackground(proc, child);
              const tail = readLogTail(logPath, { maxLines: DEFAULT_TAIL_LINES, maxBytes: MAX_TAIL_BYTES });
              resolve({ kind: "backgrounded", id, auto: true, output: tail.output, truncated: tail.truncated, logPath });
            } catch (error) {
              reject(asError(error));
            }
          })();
        }, syncWaitMs);
        waitTimer.unref();

        if (at.abortSignal?.aborted) {
          onAbort();
          return;
        }
        at.abortSignal?.addEventListener("abort", onAbort, { once: true });

        child.once("close", (code) => finishSync(code ?? 1));
        child.once("error", (error) => {
          if (settled) return;
          settled = true;
          cleanup();
          removeProcessLog(logPath);
          reject(error);
        });
      });
    },

    list: listStored,

    async read(id, lines) {
      const running = await storedMap();
      const logPath = Object.hasOwn(running, id) ? running[id]!.logPath : join(logDir, `${id}.log`);
      if (!Object.hasOwn(running, id) && !existsSync(logPath)) return undefined;
      return readLogTail(logPath, { maxLines: lines ?? DEFAULT_TAIL_LINES, maxBytes: MAX_TAIL_BYTES });
    },

    async input(id, { text, eof }) {
      const running = await storedMap();
      if (!Object.hasOwn(running, id)) return { problem: `No running process with ID ${id}.` };
      const child = live.get(id)?.child;
      if (child === undefined) return { problem: `Process ${id} was started before the agent restarted, so it can't be sent input.` };
      const stdin = child.stdin;
      if (stdin === null) {
        return { problem: `Process ${id} was started without background: true, so it takes no input. Start it again with background: true to send it input.` };
      }
      if (stdin.destroyed || stdin.writableEnded) return { problem: `Process ${id}'s input is already closed.` };
      try {
        await new Promise<void>((resolve, reject) => {
          const done = (error?: Error | null): void => (error ? reject(error) : resolve());
          if (!eof) stdin.write(text ?? "", done);
          else if (text === undefined) stdin.end(done);
          else stdin.end(text, done);
        });
      } catch (error) {
        return { problem: `Couldn't write to process ${id}: ${asError(error).message}` };
      }
      return { ok: true };
    },

    async killFromTool(id) {
      const running = await storedMap();
      const proc = Object.hasOwn(running, id) ? running[id] : undefined;
      if (proc === undefined) return { problem: `No running process with ID ${id}.` };
      suppressed.add(id);
      clearTimers(id);
      live.delete(id);
      killGroup(proc.pgid);
      await harness.commit(async (tx) => {
        const doc = await tx.doc(ProcessesDoc);
        if (Object.hasOwn(doc.running, id)) doc.running = without(doc.running, id);
      }, context);
      const tail = readLogTail(proc.logPath, { maxLines: DEFAULT_TAIL_LINES, maxBytes: MAX_TAIL_BYTES });
      return { ok: true, output: tail.output, truncated: tail.truncated };
    },
  };

  return {
    extension: processTools(runtime),

    list,

    listed: follow({
      read: list,
      watch(changed) {
        const observation = harness.observeCommits({
          advance(publication) {
            if (changesProcesses(publication)) setImmediate(changed);
          },
          end: () => undefined,
        });
        return () => observation.detach();
      },
    }),

    async output(id, lines) {
      const found = await runtime.read(id, lines);
      if (found === undefined) refuse(`No process found with ID ${id}.`);
      return found;
    },

    async kill(id) {
      const running = await storedMap();
      const proc = Object.hasOwn(running, id) ? running[id] : undefined;
      if (proc === undefined) refuse(`No running process with ID ${id}.`);
      suppressed.add(id);
      clearTimers(id);
      live.delete(id);
      killGroup(proc.pgid);
      await emitEvent(proc, "killed", null, true);
    },

    async recover() {
      const running = await listStored();
      const bootedAt = Date.now() - uptime() * 1000;
      for (const proc of running) {
        if (proc.startedAt + BOOT_SLACK_MS < bootedAt || !isGroupAlive(proc.pgid)) {
          await emitEvent(proc, "interrupted", null, true);
          continue;
        }
        // Detached child survived restart: monitor until exit and support `processOutput` + `killProcess`.
        const handle: LiveHandle = { pgid: proc.pgid };
        live.set(proc.id, handle);
        armCheckin(proc, handle);
        const poller = setInterval(() => {
          if (closed || suppressed.has(proc.id)) return;
          if (isGroupAlive(proc.pgid)) return;
          clearTimers(proc.id);
          live.delete(proc.id);
          void emitEvent(proc, "exited", null, true).catch((error: unknown) => {
            if (!closed) options.onError(new Error(`Recovered process exit for ${proc.id} failed: ${asError(error).message}`));
          });
        }, RECOVERY_POLL_MS);
        poller.unref();
        handle.recoveryPoll = poller;
      }
    },

    close() {
      closed = true;
      for (const id of [...live.keys()]) clearTimers(id);
      live.clear();
    },
  };
}

function isGroupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

function changesProcesses(publication: CommitPublication): boolean {
  return publication.changes.some(
    (change) => change.type === "document" && change.record.kind === ProcessesDoc.definition.kind,
  );
}

function without(running: Record<string, StoredProcess>, id: string): Record<string, StoredProcess> {
  return Object.fromEntries(Object.entries(copyOf(running)).filter(([key]) => key !== id));
}
