import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import { withFileTransactionLock } from "../util/file-lock.js";
import { isRecord } from "../util/record.js";
import type {
  WorkerRecord,
  WorkersState,
  WorkerStatus,
  WorkerTurn,
} from "./types.js";

export function readWorkers(path: string): WorkersState {
  return readJsonFile(path, () => ({ version: 1, workers: [] }), parseWorkersState);
}

export function writeWorkers(path: string, state: WorkersState): void {
  withFileTransactionLock(path, () => writeWorkersUnlocked(path, state));
}

export function listWorkers(path: string): WorkerRecord[] {
  return readWorkers(path).workers;
}

export function getWorker(path: string, id: string): WorkerRecord | undefined {
  return listWorkers(path).find((worker) => worker.id === id);
}

export function updateWorker(
  path: string,
  id: string,
  update: (worker: WorkerRecord) => WorkerRecord,
): WorkerRecord {
  return withFileTransactionLock(path, () => {
    const state = readWorkers(path);
    const index = state.workers.findIndex((worker) => worker.id === id);
    if (index < 0) throw new Error(`unknown worker: ${id}`);
    const worker = state.workers[index];
    if (!worker) throw new Error(`unknown worker: ${id}`);
    const next = update(worker);
    state.workers[index] = next;
    writeWorkersUnlocked(path, state);
    return next;
  });
}

export function appendWorker(path: string, worker: WorkerRecord): WorkerRecord {
  return withFileTransactionLock(path, () => {
    const state = readWorkers(path);
    if (state.workers.some((current) => current.id === worker.id)) {
      throw new Error(`worker already exists: ${worker.id}`);
    }
    state.workers.push(worker);
    writeWorkersUnlocked(path, state);
    return worker;
  });
}

function writeWorkersUnlocked(path: string, state: WorkersState): void {
  writeJsonFileAtomic(path, state);
}

function parseWorkersState(raw: unknown): WorkersState {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.workers)) {
    return { version: 1, workers: [] };
  }
  return {
    version: 1,
    workers: raw.workers.flatMap((worker) => {
      const parsed = parseWorker(worker);
      return parsed ? [parsed] : [];
    }),
  };
}

function parseWorker(raw: unknown): WorkerRecord | undefined {
  if (!isRecord(raw)) return undefined;
  if (
    typeof raw.id !== "string" ||
    typeof raw.ownerAgent !== "string" ||
    !isBackend(raw.backend) ||
    typeof raw.cwd !== "string" ||
    typeof raw.goal !== "string" ||
    typeof raw.spec !== "string" ||
    !isStatus(raw.status) ||
    typeof raw.createdAt !== "string" ||
    typeof raw.updatedAt !== "string" ||
    typeof raw.summary !== "string" ||
    !Array.isArray(raw.turns)
  ) {
    return undefined;
  }
  return {
    id: raw.id,
    ownerAgent: raw.ownerAgent,
    backend: raw.backend,
    cwd: raw.cwd,
    goal: raw.goal,
    spec: raw.spec,
    parent: parseParent(raw.parent),
    ...(typeof raw.relatedChannel === "string" ? { relatedChannel: raw.relatedChannel } : {}),
    status: raw.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    ...(typeof raw.closedAt === "string" ? { closedAt: raw.closedAt } : {}),
    ...(typeof raw.backendSessionId === "string" ? { backendSessionId: raw.backendSessionId } : {}),
    turns: raw.turns.flatMap((turn) => {
      const parsed = parseTurn(turn);
      return parsed ? [parsed] : [];
    }),
    summary: raw.summary,
  };
}

function parseTurn(raw: unknown): WorkerTurn | undefined {
  if (!isRecord(raw)) return undefined;
  if (
    typeof raw.id !== "string" ||
    (raw.kind !== "start" && raw.kind !== "amendment") ||
    typeof raw.prompt !== "string" ||
    !isStatus(raw.status) ||
    typeof raw.startedAt !== "string"
  ) {
    return undefined;
  }
  return {
    id: raw.id,
    kind: raw.kind,
    prompt: raw.prompt,
    status: raw.status,
    startedAt: raw.startedAt,
    ...(typeof raw.timeoutMs === "number" ? { timeoutMs: raw.timeoutMs } : {}),
    ...(typeof raw.finishedAt === "string" ? { finishedAt: raw.finishedAt } : {}),
    ...(typeof raw.output === "string" ? { output: raw.output } : {}),
    ...(typeof raw.error === "string" ? { error: raw.error } : {}),
    ...(typeof raw.pid === "number" ? { pid: raw.pid } : {}),
    ...(typeof raw.logPath === "string" ? { logPath: raw.logPath } : {}),
    ...(typeof raw.outputPath === "string" ? { outputPath: raw.outputPath } : {}),
    ...(typeof raw.errorPath === "string" ? { errorPath: raw.errorPath } : {}),
    ...(typeof raw.exitCode === "number" || raw.exitCode === null ? { exitCode: raw.exitCode } : {}),
    ...(typeof raw.signal === "string" || raw.signal === null ? { signal: raw.signal } : {}),
  };
}

function parseParent(raw: unknown): WorkerRecord["parent"] {
  if (!isRecord(raw)) return {};
  return {
    ...(typeof raw.session === "string" ? { session: raw.session } : {}),
    ...(typeof raw.kind === "string" ? { kind: raw.kind } : {}),
  };
}

function isStatus(value: unknown): value is WorkerStatus {
  return (
    value === "running" ||
    value === "complete" ||
    value === "blocked" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "closed"
  );
}

function isBackend(value: unknown): value is WorkerRecord["backend"] {
  return value === "codex" || value === "claude" || value === "pi";
}
