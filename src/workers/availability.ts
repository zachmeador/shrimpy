import { spawnSync } from "node:child_process";
import { createWorkspacePaths } from "../workspace/paths.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import { isRecord } from "../util/record.js";

export type WorkerBackend = "codex" | "claude" | "pi";
export type WorkerBackendAuthStatus = "configured" | "unknown" | "unavailable";

export interface WorkerBackendAvailability {
  backend: WorkerBackend;
  available: boolean;
  command?: string;
  path?: string;
  version?: string;
  authStatus: WorkerBackendAuthStatus;
  checkedAt: string;
  problem?: string;
}

export interface WorkerBackendAvailabilityState {
  version: 1;
  checkedAt: string;
  backends: Record<WorkerBackend, WorkerBackendAvailability>;
}

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

interface AvailabilityDeps {
  now?: () => Date;
  run?: (command: string, args: string[]) => CommandResult;
}

const EXTERNAL_BACKENDS: Array<{
  backend: Exclude<WorkerBackend, "pi">;
  command: string;
  versionArgs: string[];
}> = [
  { backend: "codex", command: "codex", versionArgs: ["--version"] },
  { backend: "claude", command: "claude", versionArgs: ["--version"] },
];

export function refreshWorkerBackendAvailability(
  workspace: string,
  deps: AvailabilityDeps = {},
): WorkerBackendAvailabilityState {
  const state = detectWorkerBackendAvailability(deps);
  writeWorkerBackendAvailability(workspace, state);
  return state;
}

export function readWorkerBackendAvailability(
  workspace: string,
): WorkerBackendAvailabilityState {
  return readJsonFile(
    createWorkspacePaths(workspace).workerBackendsStatePath,
    () => emptyAvailabilityState(new Date()),
    parseWorkerBackendAvailabilityState,
  );
}

export function writeWorkerBackendAvailability(
  workspace: string,
  state: WorkerBackendAvailabilityState,
): void {
  writeJsonFileAtomic(createWorkspacePaths(workspace).workerBackendsStatePath, state);
}

export function detectWorkerBackendAvailability(
  deps: AvailabilityDeps = {},
): WorkerBackendAvailabilityState {
  const now = deps.now?.() ?? new Date();
  const checkedAt = now.toISOString();
  const run = deps.run ?? runCommand;
  const backends = {} as Record<WorkerBackend, WorkerBackendAvailability>;

  for (const spec of EXTERNAL_BACKENDS) {
    backends[spec.backend] = detectExternalBackend(spec, checkedAt, run);
  }

  backends.pi = {
    backend: "pi",
    available: true,
    authStatus: "configured",
    checkedAt,
  };

  return {
    version: 1,
    checkedAt,
    backends,
  };
}

function detectExternalBackend(
  spec: { backend: Exclude<WorkerBackend, "pi">; command: string; versionArgs: string[] },
  checkedAt: string,
  run: (command: string, args: string[]) => CommandResult,
): WorkerBackendAvailability {
  const located = run("command", ["-v", spec.command]);
  if (located.status !== 0) {
    return {
      backend: spec.backend,
      available: false,
      command: spec.command,
      authStatus: "unavailable",
      checkedAt,
      problem: located.error?.message || firstLine(located.stderr) || "command not found",
    };
  }

  const version = run(spec.command, spec.versionArgs);
  return {
    backend: spec.backend,
    available: true,
    command: spec.command,
    path: firstLine(located.stdout),
    version: version.status === 0 ? firstLine(version.stdout || version.stderr) : undefined,
    authStatus: "unknown",
    checkedAt,
    ...(version.status === 0 ? {} : {
      problem: version.error?.message || firstLine(version.stderr) || "version check failed",
    }),
  };
}

function runCommand(command: string, args: string[]): CommandResult {
  const resolved = command === "command"
    ? spawnSync("sh", ["-lc", `command -v ${shellWord(args[1] ?? "")}`], { encoding: "utf-8" })
    : spawnSync(command, args, { encoding: "utf-8" });
  return {
    status: resolved.status,
    stdout: resolved.stdout ?? "",
    stderr: resolved.stderr ?? "",
    error: resolved.error,
  };
}

function shellWord(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function firstLine(value: string): string | undefined {
  const line = value.trim().split(/\r?\n/u).find(Boolean);
  return line || undefined;
}

function emptyAvailabilityState(now: Date): WorkerBackendAvailabilityState {
  const checkedAt = now.toISOString();
  return {
    version: 1,
    checkedAt,
    backends: {
      codex: {
        backend: "codex",
        available: false,
        command: "codex",
        authStatus: "unavailable",
        checkedAt,
        problem: "not checked",
      },
      claude: {
        backend: "claude",
        available: false,
        command: "claude",
        authStatus: "unavailable",
        checkedAt,
        problem: "not checked",
      },
      pi: {
        backend: "pi",
        available: true,
        authStatus: "configured",
        checkedAt,
      },
    },
  };
}

function parseWorkerBackendAvailabilityState(raw: unknown): WorkerBackendAvailabilityState {
  if (!isRecord(raw) || raw.version !== 1 || typeof raw.checkedAt !== "string" || !isRecord(raw.backends)) {
    return emptyAvailabilityState(new Date());
  }

  const fallback = emptyAvailabilityState(new Date());
  const backends = {} as Record<WorkerBackend, WorkerBackendAvailability>;
  for (const backend of ["codex", "claude", "pi"] as const) {
    const parsed = parseAvailability(raw.backends[backend], backend);
    backends[backend] = parsed ?? fallback.backends[backend];
  }

  return {
    version: 1,
    checkedAt: raw.checkedAt,
    backends,
  };
}

function parseAvailability(raw: unknown, backend: WorkerBackend): WorkerBackendAvailability | undefined {
  if (!isRecord(raw) || raw.backend !== backend || typeof raw.available !== "boolean" || typeof raw.checkedAt !== "string") {
    return undefined;
  }
  return {
    backend,
    available: raw.available,
    authStatus: parseAuthStatus(raw.authStatus),
    checkedAt: raw.checkedAt,
    ...(typeof raw.command === "string" ? { command: raw.command } : {}),
    ...(typeof raw.path === "string" ? { path: raw.path } : {}),
    ...(typeof raw.version === "string" ? { version: raw.version } : {}),
    ...(typeof raw.problem === "string" ? { problem: raw.problem } : {}),
  };
}

function parseAuthStatus(value: unknown): WorkerBackendAuthStatus {
  return value === "configured" || value === "unknown" || value === "unavailable"
    ? value
    : "unknown";
}
