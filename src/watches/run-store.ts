import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "../util/json-file.js";
import type {
  WatchAction,
  WatchConcurrencyPolicy,
  WatchTrigger,
} from "./schema.js";

export type WatchRunStatus = "success" | "failure" | "skipped";

export interface WatchRunObservation {
  kind: "no_output" | "output" | "changed" | "unchanged" | "message" | "failed" | "skipped";
  summary: string;
  outputHash?: string;
  exitCode?: number;
  stdoutPreview?: string;
  stderrPreview?: string;
}

export interface WatchRunRecord {
  ownerAgentId: string;
  localId: string;
  watchId: string;
  runId: string;
  trigger: WatchTrigger;
  actionKind: WatchAction["kind"];
  startedAtMs: number;
  startedAtIso: string;
  finishedAtMs: number;
  finishedAtIso: string;
  status: WatchRunStatus;
  attempts: number;
  concurrencyPolicy: WatchConcurrencyPolicy;
  observation: WatchRunObservation;
  emittedChannelMessageIds: string[];
  error?: string;
}

export interface ActiveWatchRunRecord {
  ownerAgentId: string;
  localId: string;
  watchId: string;
  runId: string;
  startedAtMs: number;
  startedAtIso: string;
}

export type ActiveWatchRunStore = Record<string, ActiveWatchRunRecord>;

const HISTORY_LIMIT = 200;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function activeStorePath(root: string, ownerAgentId: string): string {
  return join(root, ownerAgentId, "active.json");
}

export function watchRunsPath(root: string, ownerAgentId: string): string {
  return join(root, ownerAgentId, "runs.jsonl");
}

export function loadWatchRunHistory(
  root: string,
  ownerAgentId: string,
  opts: {
    watchId?: string;
    limit?: number;
  } = {},
): WatchRunRecord[] {
  const path = watchRunsPath(root, ownerAgentId);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const records = lines.flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return isWatchRunRecord(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
  const filtered = opts.watchId
    ? records.filter((record) => record.watchId === opts.watchId)
    : records;
  return filtered.slice(-(opts.limit ?? HISTORY_LIMIT));
}

export function appendWatchRunRecord(
  root: string,
  record: WatchRunRecord,
): void {
  const path = watchRunsPath(root, record.ownerAgentId);
  mkdirSync(dirname(path), { recursive: true });
  const previous = loadWatchRunHistory(root, record.ownerAgentId, {
    limit: HISTORY_LIMIT - 1,
  });
  const lines = [...previous, record].map((entry) => JSON.stringify(entry));
  writeFileSync(path, `${lines.join("\n")}\n`, "utf-8");
}

export function latestWatchOutputHash(
  root: string,
  ownerAgentId: string,
  watchId: string,
): string | undefined {
  const history = loadWatchRunHistory(root, ownerAgentId, {
    watchId,
    limit: HISTORY_LIMIT,
  });
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const record = history[index];
    if (!record || record.status !== "success") continue;
    if (record.observation.outputHash) return record.observation.outputHash;
  }
  return undefined;
}

export function loadActiveWatchRuns(
  root: string,
  ownerAgentId: string,
): ActiveWatchRunStore {
  return readJsonFile(
    activeStorePath(root, ownerAgentId),
    () => ({}),
    parseActiveStore,
  );
}

export function saveActiveWatchRuns(
  root: string,
  ownerAgentId: string,
  store: ActiveWatchRunStore,
): void {
  writeJsonFileAtomic(activeStorePath(root, ownerAgentId), store);
}

export function markWatchRunActive(
  root: string,
  input: Omit<ActiveWatchRunRecord, "startedAtIso">,
): ActiveWatchRunRecord {
  const store = loadActiveWatchRuns(root, input.ownerAgentId);
  const record: ActiveWatchRunRecord = {
    ...input,
    startedAtIso: iso(input.startedAtMs),
  };
  store[input.watchId] = record;
  saveActiveWatchRuns(root, input.ownerAgentId, store);
  return record;
}

export function clearWatchRunActive(
  root: string,
  ownerAgentId: string,
  watchId: string,
  runId: string,
): void {
  const store = loadActiveWatchRuns(root, ownerAgentId);
  if (store[watchId]?.runId !== runId) return;
  delete store[watchId];
  saveActiveWatchRuns(root, ownerAgentId, store);
}

export function createSkippedWatchRunRecord(
  input: {
    ownerAgentId: string;
    localId: string;
    watchId: string;
    runId: string;
    trigger: WatchTrigger;
    actionKind: WatchAction["kind"];
    concurrencyPolicy: WatchConcurrencyPolicy;
    activeRun: ActiveWatchRunRecord;
    nowMs?: number;
  },
): WatchRunRecord {
  const nowMs = input.nowMs ?? Date.now();
  return {
    ownerAgentId: input.ownerAgentId,
    localId: input.localId,
    watchId: input.watchId,
    runId: input.runId,
    trigger: input.trigger,
    actionKind: input.actionKind,
    startedAtMs: nowMs,
    startedAtIso: iso(nowMs),
    finishedAtMs: nowMs,
    finishedAtIso: iso(nowMs),
    status: "skipped",
    attempts: 0,
    concurrencyPolicy: input.concurrencyPolicy,
    observation: {
      kind: "skipped",
      summary: `skipped because run ${input.activeRun.runId} is still active`,
    },
    emittedChannelMessageIds: [],
  };
}

function parseActiveStore(raw: unknown): ActiveWatchRunStore {
  if (!isRecord(raw)) return {};
  const result: ActiveWatchRunStore = {};
  for (const [watchId, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    if (typeof value.ownerAgentId !== "string") continue;
    if (typeof value.localId !== "string") continue;
    if (typeof value.watchId !== "string") continue;
    if (typeof value.runId !== "string") continue;
    if (typeof value.startedAtMs !== "number") continue;
    if (typeof value.startedAtIso !== "string") continue;
    result[watchId] = {
      ownerAgentId: value.ownerAgentId,
      localId: value.localId,
      watchId: value.watchId,
      runId: value.runId,
      startedAtMs: value.startedAtMs,
      startedAtIso: value.startedAtIso,
    };
  }
  return result;
}

function isWatchRunRecord(value: unknown): value is WatchRunRecord {
  if (!isRecord(value)) return false;
  if (typeof value.ownerAgentId !== "string") return false;
  if (typeof value.localId !== "string") return false;
  if (typeof value.watchId !== "string") return false;
  if (typeof value.runId !== "string") return false;
  if (typeof value.startedAtMs !== "number") return false;
  if (typeof value.finishedAtMs !== "number") return false;
  if (
    value.status !== "success" &&
    value.status !== "failure" &&
    value.status !== "skipped"
  ) {
    return false;
  }
  if (!isRecord(value.observation)) return false;
  if (!Array.isArray(value.emittedChannelMessageIds)) return false;
  return true;
}
