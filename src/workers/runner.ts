import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shrimpyRuntimeChildEnv } from "../app/environment.js";
import { createAppRuntime } from "../app/runtime.js";
import { projectRoot } from "../app/project-root.js";
import type { ShrimpyConfig } from "../config/load.js";
import { runForegroundAgentPrompt } from "../sessions/foreground.js";
import {
  readWorkerBackendAvailability,
  type WorkerBackend,
} from "./availability.js";

export interface WorkerLaunchInput {
  config: ShrimpyConfig;
  workerId: string;
  turnId: string;
}

export interface WorkerLaunchResult {
  pid: number;
}

export interface WorkerRunInput {
  config: ShrimpyConfig;
  workerId: string;
  turnId: string;
  ownerAgent: string;
  backend: WorkerBackend;
  cwd: string;
  prompt: string;
  timeoutMs?: number;
  backendSessionId?: string;
  logPath: string;
  outputPath: string;
  errorPath: string;
}

export interface WorkerRunResult {
  status: "complete" | "blocked" | "failed" | "cancelled";
  output?: string;
  error?: string;
  backendSessionId?: string;
  exitCode?: number | null;
  signal?: string | null;
  timedOut?: boolean;
}

export interface WorkerSupervisor {
  launch(input: WorkerLaunchInput): WorkerLaunchResult;
}

const WORKER_CONTRACT = [
  "You are running as a Shrimpy coding worker.",
  "",
  "Shrimpy context:",
  `- Shrimpy source checkout: ${projectRoot}`,
  `- Shrimpy source: ${join(projectRoot, "src")}`,
  `- Shrimpy docs: ${join(projectRoot, "docs")}`,
  "- Worker cwd is the target project directory. If the task depends on Shrimpy behavior, inspect the Shrimpy source/docs above.",
  "",
  "Treat the user's text as a contract for one autonomous work turn.",
  "Pursue the requested goal without waiting for hand-holding.",
  "Stop and report blocked when required information, access, or approval is missing.",
  "Avoid destructive or irreversible actions unless the contract explicitly authorizes them.",
  "Leave merge, publish, delete, and reset decisions to the parent.",
].join("\n");

export function defaultWorkerSupervisor(): WorkerSupervisor {
  return {
    launch(input) {
      const child = spawn(
        process.execPath,
        [
          supervisorScriptPath(),
          "--workspace",
          input.config.workspace,
          "--worker",
          input.workerId,
          "--turn",
          input.turnId,
        ],
        {
          detached: true,
          stdio: "ignore",
          env: shrimpyRuntimeChildEnv(input.config.workspace),
        },
      );
      if (!child.pid) {
        throw new Error("failed to start worker supervisor");
      }
      child.unref();
      return { pid: child.pid };
    },
  };
}

export async function runWorkerTurn(input: WorkerRunInput): Promise<WorkerRunResult> {
  if (input.backend === "claude") {
    const availability = readWorkerBackendAvailability(input.config.workspace).backends[input.backend];
    return {
      status: "failed",
      error: availability.available
        ? "claude worker backend is detected but deferred to P3"
        : `claude worker backend is unavailable: ${availability.problem ?? "command not found"}`,
    };
  }

  const availability = readWorkerBackendAvailability(input.config.workspace).backends[input.backend];
  if (!availability.available) {
    return {
      status: "failed",
      error: `${input.backend} worker backend is unavailable: ${availability.problem ?? "command not found"}`,
    };
  }

  return input.backend === "pi"
    ? runWithTimeout(input, () => runPiTurn(input))
    : runCodexTurn(input);
}

function runCodexTurn(input: WorkerRunInput): Promise<WorkerRunResult> {
  mkdirSync(dirname(input.logPath), { recursive: true });
  const stdout = createWriteStream(input.logPath, { flags: "a" });
  const stderr = createWriteStream(input.errorPath, { flags: "a" });
  const args = buildCodexArgs(input);
  const child = spawn("codex", args, {
    cwd: input.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: shrimpyRuntimeChildEnv(input.config.workspace),
  });
  let jsonl = "";
  let spawnError: Error | undefined;
  let timedOut = false;
  let timeout: NodeJS.Timeout | undefined;
  let killTimeout: NodeJS.Timeout | undefined;

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf-8");
    jsonl += text;
    stdout.write(text);
  });
  child.stderr?.pipe(stderr);
  child.on("error", (err) => {
    spawnError = err;
  });
  child.stdin?.end(buildWorkerPrompt(input.prompt));
  if (input.timeoutMs && input.timeoutMs > 0) {
    timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimeout = setTimeout(() => {
        child.kill("SIGKILL");
      }, 2_000);
    }, input.timeoutMs);
  }

  return new Promise((resolve) => {
    child.on("close", (exitCode, signal) => {
      if (timeout) clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      stdout.end();
      stderr.end();
      const output = readTextIfExists(input.outputPath);
      const errorText = spawnError?.message || readTextIfExists(input.errorPath);
      const backendSessionId = extractCodexSessionId(jsonl) ?? input.backendSessionId;
      const failed = spawnError || exitCode !== 0;
      if (timedOut) {
        resolve({
          status: "cancelled",
          ...(output ? { output } : {}),
          error: `worker turn timed out after ${input.timeoutMs} ms`,
          ...(backendSessionId ? { backendSessionId } : {}),
          exitCode,
          signal,
          timedOut: true,
        });
        return;
      }
      resolve({
        status: failed ? "failed" : inferWorkerStatus(output),
        ...(output ? { output } : {}),
        ...(failed && errorText ? { error: errorText.trim() } : {}),
        ...(backendSessionId ? { backendSessionId } : {}),
        exitCode,
        signal,
      });
    });
  });
}

function runWithTimeout(
  input: WorkerRunInput,
  run: () => Promise<WorkerRunResult>,
): Promise<WorkerRunResult> {
  if (!input.timeoutMs || input.timeoutMs <= 0) return run();
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        status: "cancelled",
        error: `worker turn timed out after ${input.timeoutMs} ms`,
        exitCode: null,
        signal: "SIGTERM",
        timedOut: true,
      });
    }, input.timeoutMs);
    run().then((result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    }, (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        exitCode: null,
        signal: null,
      });
    });
  });
}

export function buildCodexArgs(input: Pick<WorkerRunInput, "backendSessionId" | "cwd" | "outputPath">): string[] {
  const commonArgs = [
    "-c",
    "approval_policy=\"on-request\"",
    "-c",
    "approvals_reviewer=\"auto_review\"",
    "-c",
    "sandbox_mode=\"danger-full-access\"",
    "--skip-git-repo-check",
    "--json",
    "--output-last-message",
    input.outputPath,
  ];
  return input.backendSessionId
    ? ["exec", "resume", ...commonArgs, input.backendSessionId, "-"]
    : ["exec", ...commonArgs, "--cd", input.cwd, "-"];
}

export function buildWorkerPrompt(prompt: string): string {
  return `${WORKER_CONTRACT}\n\n${prompt}`;
}

async function runPiTurn(input: WorkerRunInput): Promise<WorkerRunResult> {
  mkdirSync(dirname(input.logPath), { recursive: true });
  try {
    const runtime = createAppRuntime(input.config);
    const { output } = await runForegroundAgentPrompt({
      runtime,
      agentId: input.ownerAgent,
      session: { namespace: "worker", name: input.workerId },
      purpose: "worker",
      persistent: true,
      cwd: input.cwd,
      modelPolicy: "coding",
      prompt: buildWorkerPrompt(input.prompt),
    });
    writeFileSync(input.outputPath, output, "utf-8");
    writeFileSync(
      input.logPath,
      `${JSON.stringify({
        type: "assistant",
        backend: "pi",
        workerId: input.workerId,
        turnId: input.turnId,
        text: output,
      })}\n`,
      "utf-8",
    );
    writeFileSync(input.errorPath, "", "utf-8");
    return buildPiWorkerRunResult({
      output,
      backendSessionId: input.backendSessionId ?? input.workerId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    writeFileSync(input.errorPath, `${message}\n`, "utf-8");
    return {
      status: "failed",
      error: message,
      exitCode: null,
      signal: null,
    };
  }
}

function supervisorScriptPath(): string {
  return fileURLToPath(new URL("./supervisor.js", import.meta.url));
}

function readTextIfExists(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf-8");
}

export function buildPiWorkerRunResult(input: {
  output: string;
  backendSessionId: string;
}): WorkerRunResult {
  return {
    status: inferWorkerStatus(input.output),
    output: input.output,
    backendSessionId: input.backendSessionId,
    exitCode: 0,
    signal: null,
  };
}

function inferWorkerStatus(output: string): "complete" | "blocked" {
  const head = output.slice(0, 1000).toLowerCase();
  return /\bblocked\b/u.test(head) ? "blocked" : "complete";
}

export function extractCodexSessionId(jsonl: string): string | undefined {
  for (const line of jsonl.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      const sessionId = findSessionId(parsed);
      if (sessionId) return sessionId;
    } catch {
      // Ignore non-JSON output; Codex JSON mode should be JSONL, but stderr and
      // wrapper messages may still vary across versions.
    }
  }
  return undefined;
}

function findSessionId(value: unknown, parentKey = ""): string | undefined {
  if (typeof value === "string") {
    return looksLikeUuid(value) && /session|conversation|thread/u.test(parentKey)
      ? value
      : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/^(session_id|sessionId|conversation_id|conversationId|thread_id|threadId)$/u.test(key) && typeof child === "string") {
      return child;
    }
    const found = findSessionId(child, key);
    if (found) return found;
  }
  return undefined;
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
