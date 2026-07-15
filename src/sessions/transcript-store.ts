import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  parseSessionEntries,
  SessionManager,
  type CustomEntry,
  type FileEntry,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import type { ModelRef } from "../config/model.js";
import { isRecord } from "../util/record.js";

const LIFECYCLE_CUSTOM_TYPE = "shrimpy_lifecycle";

type SessionLifecycleState = "active" | "archived";

interface SessionLifecycleData {
  state: SessionLifecycleState;
}

interface StoredSessionSummary {
  path: string;
  updatedAtMs: number;
  state: SessionLifecycleState;
}

export function archiveActiveSession(sessionDir: string): string | undefined {
  const active = findActiveSessionFile(sessionDir);
  if (!active) return undefined;
  return archiveSessionFile(active);
}

export function archiveSessionFile(sessionFile: string): string | undefined {
  if (!readStoredSession(sessionFile)) return undefined;
  appendLifecycleEntry(sessionFile, "archived");
  return sessionFile;
}

export function listArchivedSessionFiles(sessionDir: string): string[] {
  return listStoredSessions(sessionDir)
    .filter((session) => session.state === "archived")
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .map((session) => session.path);
}

export function resolveArchivedSessionFile(
  sessionDir: string,
  archiveName?: string,
): string | undefined {
  if (!archiveName) {
    return listArchivedSessionFiles(sessionDir)[0];
  }

  if (archiveName.includes("/") || archiveName.includes("\\")) {
    return readStoredSession(archiveName)?.state === "archived"
      ? archiveName
      : undefined;
  }

  const candidate = join(sessionDir, archiveName);
  return readStoredSession(candidate)?.state === "archived" ? candidate : undefined;
}

export function restoreArchivedSession(
  sessionDir: string,
  archiveName?: string,
): {
  restoredFrom: string;
  archivedPreviousTo?: string;
} | undefined {
  const archivedSource = resolveArchivedSessionFile(sessionDir, archiveName);
  if (!archivedSource) return undefined;

  const archivedPreviousTo = archiveActiveSession(sessionDir);
  appendLifecycleEntry(archivedSource, "active");

  return {
    restoredFrom: archivedSource,
    archivedPreviousTo,
  };
}

export function openSessionManager(cwd: string, sessionDir: string): SessionManager {
  const active = findActiveSessionFile(sessionDir);
  return active
    ? SessionManager.open(active, sessionDir, cwd)
    : SessionManager.create(cwd, sessionDir);
}

export function readSessionRecordedModel(
  cwd: string,
  sessionDir: string,
): ModelRef | undefined {
  try {
    const model = openSessionManager(cwd, sessionDir).buildSessionContext().model;
    return model
      ? { provider: model.provider, id: model.modelId }
      : undefined;
  } catch {
    return undefined;
  }
}

export function findActiveSessionFile(sessionDir: string): string | undefined {
  return listStoredSessions(sessionDir)
    .filter((session) => session.state === "active")
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0]?.path;
}

export function findMostRecentSessionFile(sessionDir: string): string | undefined {
  return listStoredSessions(sessionDir)
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0]?.path;
}

export function findLastCustomEntry<T = unknown>(
  source: readonly unknown[],
  customType: string,
): CustomEntry<T> | undefined {
  for (let index = source.length - 1; index >= 0; index--) {
    const entry = typeof source[index] === "string"
      ? parseJsonLine(source[index] as string)
      : source[index];
    if (!isRecord(entry)) continue;
    if (entry.type !== "custom" || entry.customType !== customType) continue;
    return entry as unknown as CustomEntry<T>;
  }
  return undefined;
}

function listStoredSessions(sessionDir: string): StoredSessionSummary[] {
  if (!existsSync(sessionDir)) return [];

  return readdirSync(sessionDir)
    .filter((entry) => entry.endsWith(".jsonl"))
    .map((entry) => readStoredSession(join(sessionDir, entry)))
    .filter((session): session is StoredSessionSummary => session !== null);
}

function readStoredSession(path: string): StoredSessionSummary | null {
  if (!existsSync(path)) return null;

  const entries = readSessionEntries(path);
  if (entries.length === 0) return null;
  const header = entries[0];
  if (header.type !== "session" || typeof header.id !== "string") return null;

  return {
    path,
    updatedAtMs: statSync(path).mtimeMs,
    state: readLifecycleState(entries),
  };
}

function readSessionEntries(path: string): FileEntry[] {
  try {
    return parseSessionEntries(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

function readLifecycleState(entries: FileEntry[]): SessionLifecycleState {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!isLifecycleEntry(entry)) continue;
    return entry.data?.state ?? "active";
  }
  return "active";
}

function isLifecycleEntry(entry: FileEntry): entry is CustomEntry<SessionLifecycleData> {
  if (entry.type !== "custom" || entry.customType !== LIFECYCLE_CUSTOM_TYPE) {
    return false;
  }
  const data = entry.data;
  return typeof data === "object"
    && data !== null
    && "state" in data
    && (data.state === "active" || data.state === "archived");
}

function appendLifecycleEntry(path: string, state: SessionLifecycleState): void {
  const entries = readSessionEntries(path);
  if (entries.length === 0) return;

  const lastEntry = [...entries].reverse().find(isSessionEntry);
  const entry: CustomEntry<SessionLifecycleData> = {
    type: "custom",
    customType: LIFECYCLE_CUSTOM_TYPE,
    data: { state },
    id: randomUUID().slice(0, 8),
    parentId: lastEntry?.id ?? null,
    timestamp: new Date().toISOString(),
  };
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf-8");
}

function isSessionEntry(entry: FileEntry): entry is SessionEntry {
  return entry.type !== "session";
}
