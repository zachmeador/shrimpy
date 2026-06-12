import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ShrimpyConfig } from "../config/index.js";
import { createAgentPaths, createWorkspacePaths } from "../app/index.js";
import { readWorkerBackendAvailability } from "./availability.js";
import type {
  WorkerBackendKind,
  WorkerRecord,
  WorkerStatus,
  WorkerTurn,
} from "./types.js";
import {
  appendWorker,
  getWorker,
  listWorkers,
  updateWorker,
} from "./store.js";
import {
  defaultWorkerSupervisor,
  type WorkerSupervisor,
} from "./runner.js";

export interface StartWorkerInput {
  config: ShrimpyConfig;
  ownerAgent?: string;
  backend?: WorkerBackendKind;
  cwd?: string;
  goal?: string;
  spec: string;
  timeoutMs?: number;
  parentSession?: string;
  parentKind?: string;
  relatedChannel?: string;
  supervisor?: WorkerSupervisor;
}

export interface AmendWorkerInput {
  config: ShrimpyConfig;
  id: string;
  prompt: string;
  timeoutMs?: number;
  supervisor?: WorkerSupervisor;
}

const WORKER_TERMINATION_GRACE_MS = 2_000;
const WORKER_KILL_GRACE_MS = 500;
const WORKER_TERMINATION_POLL_MS = 50;

export function workersPath(config: ShrimpyConfig): string {
  return createWorkspacePaths(config.workspace).workersStatePath;
}

export function listWorkerRecords(config: ShrimpyConfig): WorkerRecord[] {
  return listWorkers(workersPath(config)).map((worker) => reconcileWorker(config, worker));
}

export function readWorkerRecord(config: ShrimpyConfig, id: string): WorkerRecord {
  const worker = getWorker(workersPath(config), id);
  if (!worker) throw new Error(`unknown worker: ${id}`);
  return reconcileWorker(config, worker);
}

export async function startWorker(input: StartWorkerInput): Promise<WorkerRecord> {
  const now = new Date().toISOString();
  const id = `wrk_${randomUUID().slice(0, 8)}`;
  const ownerAgent = input.ownerAgent ?? defaultOwnerAgent(input.config);
  const worker: WorkerRecord = {
    id,
    ownerAgent,
    backend: input.backend ?? "codex",
    cwd: resolve(input.cwd ?? defaultWorkerCwd(input.config, ownerAgent)),
    goal: input.goal ?? firstLine(input.spec),
    spec: input.spec,
    parent: {
      ...(input.parentSession ? { session: input.parentSession } : {}),
      ...(input.parentKind ? { kind: input.parentKind } : {}),
    },
    ...(input.relatedChannel ? { relatedChannel: input.relatedChannel } : {}),
    status: "running",
    createdAt: now,
    updatedAt: now,
    turns: [{
      id: `${id}_turn_1`,
      kind: "start",
      prompt: input.spec,
      status: "running",
      startedAt: now,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    }],
    summary: renderWorkerSummary({
      id,
      goal: input.goal ?? firstLine(input.spec),
      status: "running",
      output: "",
    }),
  };
  mkdirSync(worker.cwd, { recursive: true });
  appendWorker(workersPath(input.config), worker);
  return launchLatestTurn(input.config, worker.id, input.supervisor);
}

export async function amendWorker(input: AmendWorkerInput): Promise<WorkerRecord> {
  const path = workersPath(input.config);
  const now = new Date().toISOString();
  const worker = updateWorker(path, input.id, (current) => {
    assertOpenForAmendment(current);
    const turn: WorkerTurn = {
      id: `${current.id}_turn_${current.turns.length + 1}`,
      kind: "amendment",
      prompt: input.prompt,
      status: "running",
      startedAt: now,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    };
    return {
      ...current,
      status: "running",
      updatedAt: now,
      turns: [...current.turns, turn],
      summary: renderWorkerSummary({
        id: current.id,
        goal: current.goal,
        status: "running",
        output: current.summary,
      }),
    };
  });
  return launchLatestTurn(input.config, worker.id, input.supervisor);
}

export function cancelWorker(config: ShrimpyConfig, id: string): WorkerRecord {
  const now = new Date().toISOString();
  const worker = readWorkerRecord(config, id);
  const runningTurn = findLastTurn(worker.turns, (turn) => turn.status === "running" && turn.pid !== undefined);
  let terminationSignal: NodeJS.Signals = "SIGTERM";
  if (runningTurn?.pid) {
    terminationSignal = terminateWorkerProcessGroup(runningTurn.pid).finalSignal ?? "SIGTERM";
  }
  return updateWorker(workersPath(config), id, (current) => ({
    ...current,
    status: "cancelled",
    updatedAt: now,
    turns: current.turns.map((turn) =>
      turn.status === "running"
        ? {
          ...turn,
          status: "cancelled" as const,
          finishedAt: now,
          signal: terminationSignal,
        }
        : turn,
    ),
    summary: renderWorkerSummary({
      id: current.id,
      goal: current.goal,
      status: "cancelled",
      output: "Worker was cancelled by the parent.",
    }),
  }));
}

export function closeWorker(config: ShrimpyConfig, id: string): WorkerRecord {
  const now = new Date().toISOString();
  const worker = readWorkerRecord(config, id);
  const runningTurn = findLastTurn(worker.turns, (turn) => turn.status === "running" && turn.pid !== undefined);
  let terminationSignal: NodeJS.Signals = "SIGTERM";
  if (runningTurn?.pid) {
    terminationSignal = terminateWorkerProcessGroup(runningTurn.pid).finalSignal ?? "SIGTERM";
  }
  return updateWorker(workersPath(config), id, (worker) => ({
    ...worker,
    status: "closed",
    updatedAt: now,
    closedAt: now,
    turns: worker.turns.map((turn) =>
      turn.status === "running"
        ? {
          ...turn,
          status: "cancelled" as const,
          finishedAt: now,
          signal: terminationSignal,
        }
        : turn,
    ),
    summary: renderWorkerSummary({
      id: worker.id,
      goal: worker.goal,
      status: "closed",
      output: worker.summary,
    }),
  }));
}

export async function waitForWorker(
  config: ShrimpyConfig,
  id: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<WorkerRecord> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? 0;
  const pollMs = opts.pollMs ?? 500;
  while (true) {
    const worker = readWorkerRecord(config, id);
    if (worker.status !== "running") return worker;
    if (timeoutMs > 0 && Date.now() - start >= timeoutMs) return worker;
    await new Promise((resolveWait) => setTimeout(resolveWait, pollMs));
  }
}

function launchLatestTurn(
  config: ShrimpyConfig,
  id: string,
  supervisor: WorkerSupervisor = defaultWorkerSupervisor(),
): WorkerRecord {
  const worker = readWorkerRecord(config, id);
  const turn = worker.turns.at(-1);
  if (!turn) throw new Error(`worker ${id} has no turns`);
  const unavailable = worker.backend === "codex"
    ? unavailableBackendError(config, "codex")
    : worker.backend === "pi"
      ? unavailableBackendError(config, "pi")
      : worker.backend === "claude"
        ? "claude worker backend is deferred to P3"
      : undefined;
  if (unavailable) {
    const now = new Date().toISOString();
    return updateWorker(workersPath(config), id, (current) => finalizeTurn(current, turn.id, {
      status: "failed",
      now,
      error: unavailable,
    }));
  }

  const artifacts = workerTurnArtifacts(config, worker.id, turn.id);
  mkdirSync(artifacts.dir, { recursive: true });
  const launched = supervisor.launch({
    config,
    workerId: worker.id,
    turnId: turn.id,
  });
  const now = new Date().toISOString();
  return updateWorker(workersPath(config), id, (current) => {
    const turns = current.turns.map((candidate) =>
      candidate.id === turn.id
        ? {
          ...candidate,
          status: "running" as const,
          pid: launched.pid,
          logPath: artifacts.logPath,
          outputPath: artifacts.outputPath,
          errorPath: artifacts.errorPath,
        }
        : candidate,
    );
    return {
      ...current,
      status: "running",
      updatedAt: now,
      turns,
      summary: renderWorkerSummary({
        id: current.id,
        goal: current.goal,
        status: "running",
        output: `Turn ${turn.id} is running in process ${launched.pid}.`,
      }),
    };
  });
}

export function finalizeWorkerTurn(
  config: ShrimpyConfig,
  id: string,
  turnId: string,
  result: {
    status: Extract<WorkerStatus, "complete" | "blocked" | "failed" | "cancelled">;
    output?: string;
    error?: string;
    backendSessionId?: string;
    exitCode?: number | null;
    signal?: string | null;
  },
): WorkerRecord {
  const now = new Date().toISOString();
  return updateWorker(workersPath(config), id, (current) =>
    finalizeTurn(current, turnId, {
      status: result.status,
      now,
      output: result.output,
      error: result.error,
      backendSessionId: result.backendSessionId,
      exitCode: result.exitCode,
      signal: result.signal,
    })
  );
}

function assertOpenForAmendment(worker: WorkerRecord): void {
  if (worker.status === "running" || worker.status === "cancelled" || worker.status === "closed") {
    throw new Error(`worker ${worker.id} is ${worker.status}`);
  }
}

function finalizeTurn(
  current: WorkerRecord,
  turnId: string,
  input: {
    status: Extract<WorkerStatus, "complete" | "blocked" | "failed" | "cancelled">;
    now: string;
    output?: string;
    error?: string;
    backendSessionId?: string;
    exitCode?: number | null;
    signal?: string | null;
  },
): WorkerRecord {
  const turns = current.turns.map((candidate) =>
    candidate.id === turnId
      ? {
        ...candidate,
        status: input.status,
        finishedAt: input.now,
        ...(input.output ? { output: input.output } : {}),
        ...(input.error ? { error: input.error } : {}),
        ...(input.exitCode !== undefined ? { exitCode: input.exitCode } : {}),
        ...(input.signal !== undefined ? { signal: input.signal } : {}),
      }
      : candidate,
  );
  const output = input.output ?? input.error ?? "";
  return {
    ...current,
    status: input.status,
    updatedAt: input.now,
    ...(input.backendSessionId ? { backendSessionId: input.backendSessionId } : {}),
    turns,
    summary: renderWorkerSummary({
      id: current.id,
      goal: current.goal,
      status: input.status,
      output,
    }),
  };
}

function reconcileWorker(config: ShrimpyConfig, worker: WorkerRecord): WorkerRecord {
  if (worker.status !== "running") return worker;
  const runningTurn = findLastTurn(worker.turns, (turn) => turn.status === "running");
  if (!runningTurn?.pid || isProcessAlive(runningTurn.pid)) return worker;
  const cleanup = terminateWorkerProcessGroup(runningTurn.pid);
  const now = new Date().toISOString();
  return updateWorker(workersPath(config), worker.id, (current) => finalizeTurn(current, runningTurn.id, {
    status: "failed",
    now,
    error: cleanup.signalled
      ? cleanup.forceKilled
        ? "worker supervisor exited without finalizing state; force-killed remaining process group"
        : "worker supervisor exited without finalizing state; terminated remaining process group"
      : "worker supervisor exited without finalizing state",
  }));
}

export function workerTurnArtifacts(
  config: ShrimpyConfig,
  workerId: string,
  turnId: string,
): {
  dir: string;
  logPath: string;
  outputPath: string;
  errorPath: string;
} {
  const dir = join(createWorkspacePaths(config.workspace).runtimeWorkersDir, workerId);
  return {
    dir,
    logPath: join(dir, `${turnId}.jsonl`),
    outputPath: join(dir, `${turnId}.last-message.md`),
    errorPath: join(dir, `${turnId}.stderr.log`),
  };
}

function unavailableBackendError(config: ShrimpyConfig, backend: "codex" | "pi"): string | undefined {
  const availability = readWorkerBackendAvailability(config.workspace).backends[backend];
  return availability.available
    ? undefined
    : `${backend} worker backend is unavailable: ${availability.problem ?? "command not found"}`;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return isPermissionDenied(err);
  }
}

interface WorkerTerminationResult {
  signalled: boolean;
  forceKilled: boolean;
  finalSignal?: NodeJS.Signals;
}

function terminateWorkerProcessGroup(pid: number): WorkerTerminationResult {
  const termSignalled = signalWorkerProcessGroup(pid, "SIGTERM");
  if (!termSignalled) {
    return { signalled: false, forceKilled: false };
  }
  if (waitForWorkerProcessGroupExit(pid, WORKER_TERMINATION_GRACE_MS)) {
    return { signalled: true, forceKilled: false, finalSignal: "SIGTERM" };
  }

  const killSignalled = signalWorkerProcessGroup(pid, "SIGKILL");
  if (!killSignalled) {
    return { signalled: true, forceKilled: false, finalSignal: "SIGTERM" };
  }
  waitForWorkerProcessGroupExit(pid, WORKER_KILL_GRACE_MS);
  return { signalled: true, forceKilled: true, finalSignal: "SIGKILL" };
}

function signalWorkerProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
  if (sendProcessSignal(-pid, signal)) return true;
  return sendProcessSignal(pid, signal);
}

function sendProcessSignal(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (err) {
    return isPermissionDenied(err);
  }
}

function waitForWorkerProcessGroupExit(pid: number, timeoutMs: number): boolean {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isWorkerProcessGroupAlive(pid)) return true;
    sleepSync(WORKER_TERMINATION_POLL_MS);
  }
  return !isWorkerProcessGroupAlive(pid);
}

function isWorkerProcessGroupAlive(pid: number): boolean {
  if (isSignalTargetAlive(-pid)) return true;
  return isSignalTargetAlive(pid);
}

function isSignalTargetAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return isPermissionDenied(err);
  }
}

function isPermissionDenied(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "EPERM");
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function findLastTurn(
  turns: WorkerTurn[],
  predicate: (turn: WorkerTurn) => boolean,
): WorkerTurn | undefined {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (predicate(turn)) return turn;
  }
  return undefined;
}

function renderWorkerSummary(input: {
  id: string;
  goal: string;
  status: WorkerStatus;
  output: string;
}): string {
  const output = input.output.trim();
  const keyActions = summarizeKeyActions(output);
  const files = summarizeFiles(output);
  const blockers = summarizeBlockers(input.status, output);
  return [
    `# Worker ${input.id}`,
    "",
    `Status: ${input.status}`,
    `Goal: ${input.goal}`,
    "",
    "## Key Actions",
    "",
    formatBullets(keyActions),
    "",
    "## Files Touched",
    "",
    formatBullets(files),
    "",
    "## Blockers",
    "",
    formatBullets(blockers),
    "",
    output ? "## Latest Result" : "## Latest Result",
    "",
    output || "(no output yet)",
  ].join("\n");
}

function summarizeKeyActions(output: string): string[] {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.replace(/^[-*]\s+/u, "").trim())
    .filter(Boolean)
    .filter((line) => !/^files (made|changed|touched|created):?$/iu.test(line))
    .filter((line) => !/^no network commands were run\.?$/iu.test(line));
  return unique(lines.map((line) => clipOneLine(line, 140))).slice(0, 4);
}

function summarizeFiles(output: string): string[] {
  const files = new Set<string>();
  const pathPattern = /`([^`\n]*(?:\/[^`\n]+|\.[a-zA-Z0-9]{1,12})[^`\n]*)`/gu;
  for (const match of output.matchAll(pathPattern)) {
    const value = match[1]?.trim();
    if (value) files.add(value);
  }
  return [...files].slice(0, 8);
}

function summarizeBlockers(status: WorkerStatus, output: string): string[] {
  if (status === "blocked" || status === "failed" || status === "cancelled") {
    return [clipOneLine(output || `worker is ${status}`, 180)];
  }
  return [];
}

function formatBullets(items: string[]): string {
  if (items.length === 0) return "- none";
  return items.map((item) => `- ${item}`).join("\n");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clipOneLine(text: string, max: number): string {
  const oneLine = text.replaceAll(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 3)}...`;
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/u).find(Boolean)?.slice(0, 120) || "coding worker";
}

function defaultOwnerAgent(config: ShrimpyConfig): string {
  const first = Array.isArray(config.agents) ? config.agents[0] : undefined;
  return typeof first?.id === "string" ? first.id : "shrimpy";
}

function defaultWorkerCwd(config: ShrimpyConfig, ownerAgent: string): string {
  const agents = Array.isArray(config.agents) ? config.agents : [];
  const agent = agents.find((candidate) => candidate.id === ownerAgent);
  if (agent?.root) {
    return createAgentPaths(config.workspace, agent.root).projectsDir;
  }
  return process.cwd();
}
