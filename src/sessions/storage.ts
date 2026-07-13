import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
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
import type { SessionDescriptor, SessionDelivery } from "./spec.js";
import { createSessionDescriptor } from "./spec.js";
import type { SessionKey } from "./identity.js";
import { sameSessionKey } from "./identity.js";

const LIFECYCLE_CUSTOM_TYPE = "shrimpy_lifecycle";
const SESSION_MANIFEST_NAME = "session.json";
const SESSION_MANIFEST_VERSION = 1;

type SessionLifecycleState = "active" | "archived";

interface SessionLifecycleData {
  state: SessionLifecycleState;
}

interface StoredSessionSummary {
  path: string;
  updatedAtMs: number;
  state: SessionLifecycleState;
}

export interface SessionManifest {
  version: typeof SESSION_MANIFEST_VERSION;
  key: SessionKey;
  purpose: string;
  delivery: SessionDelivery;
}

export function ensureSessionManifest(descriptor: SessionDescriptor): void {
  if (descriptor.storage.kind !== "durable") return;
  const path = join(descriptor.storage.dir, SESSION_MANIFEST_NAME);
  const expected = manifestFromDescriptor(descriptor);
  const existing = readSessionManifest(path);
  if (existing) {
    if (!sameSessionKey(existing.key, expected.key)) {
      throw new Error(`session manifest identity mismatch: ${path}`);
    }
    if (
      existing.purpose !== expected.purpose ||
      JSON.stringify(existing.delivery) !== JSON.stringify(expected.delivery)
    ) {
      throw new Error(`session manifest binding mismatch: ${path}`);
    }
    return;
  }

  mkdirSync(descriptor.storage.dir, { recursive: true });
  writeFileSync(path, `${JSON.stringify(expected, null, 2)}\n`, "utf8");
}

export function readSessionManifest(path: string): SessionManifest | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parseSessionManifest(value);
  } catch {
    return undefined;
  }
}

export function listSessionDescriptors(agentRoot: string): SessionDescriptor[] {
  const sessionsRoot = join(agentRoot, "sessions");
  if (!existsSync(sessionsRoot)) return [];
  const descriptors: SessionDescriptor[] = [];

  for (const namespace of readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!namespace.isDirectory()) continue;
    const namespacePath = join(sessionsRoot, namespace.name);
    for (const name of readdirSync(namespacePath, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;
      const namePath = join(namespacePath, name.name);
      for (const profile of readdirSync(namePath, { withFileTypes: true })) {
        if (!profile.isDirectory()) continue;
        const manifest = readSessionManifest(
          join(namePath, profile.name, SESSION_MANIFEST_NAME),
        );
        if (!manifest) continue;
        descriptors.push(createSessionDescriptor({
          agentRoot,
          key: manifest.key,
          purpose: manifest.purpose,
          delivery: manifest.delivery,
        }));
      }
    }
  }

  return descriptors;
}

export function archiveSessionDir(sessionDir: string): string | undefined {
  const active = findActiveSessionFile(sessionDir);
  if (!active) return undefined;
  return archiveSessionFile(active);
}

export function archiveSessionFile(sessionFile: string): string | undefined {
  if (!readStoredSession(sessionFile)) return undefined;
  appendLifecycleEntry(sessionFile, "archived");
  return sessionFile;
}

export function listArchivedSessionDirs(sessionDir: string): string[] {
  return listStoredSessions(sessionDir)
    .filter((session) => session.state === "archived")
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .map((session) => session.path);
}

export function resolveArchivedSessionDir(
  sessionDir: string,
  archiveName?: string,
): string | undefined {
  if (!archiveName) {
    return listArchivedSessionDirs(sessionDir)[0];
  }

  if (archiveName.includes("/") || archiveName.includes("\\")) {
    return readStoredSession(archiveName)?.state === "archived"
      ? archiveName
      : undefined;
  }

  const candidate = join(sessionDir, archiveName);
  return readStoredSession(candidate)?.state === "archived" ? candidate : undefined;
}

export function restoreArchivedSessionDir(
  sessionDir: string,
  archiveName?: string,
): {
  restoredFrom: string;
  archivedPreviousTo?: string;
} | undefined {
  const archivedSource = resolveArchivedSessionDir(sessionDir, archiveName);
  if (!archivedSource) return undefined;

  const archivedPreviousTo = archiveSessionDir(sessionDir);
  appendLifecycleEntry(archivedSource, "active");

  return {
    restoredFrom: archivedSource,
    archivedPreviousTo,
  };
}

export function createSessionManager(cwd: string, sessionDir: string): SessionManager {
  const active = findActiveSessionFile(sessionDir);
  return active
    ? SessionManager.open(active, sessionDir, cwd)
    : SessionManager.create(cwd, sessionDir);
}

function manifestFromDescriptor(descriptor: SessionDescriptor): SessionManifest {
  return {
    version: SESSION_MANIFEST_VERSION,
    key: descriptor.key,
    purpose: descriptor.purpose,
    delivery: descriptor.delivery,
  };
}

function parseSessionManifest(value: unknown): SessionManifest | undefined {
  if (!isRecord(value) || value.version !== SESSION_MANIFEST_VERSION) return undefined;
  if (!isRecord(value.key)) return undefined;
  const { agentId, namespace, name, profileId } = value.key;
  if (
    typeof agentId !== "string" ||
    (namespace !== "local" && namespace !== "channel" && namespace !== "worker") ||
    typeof name !== "string" ||
    typeof profileId !== "string" ||
    typeof value.purpose !== "string" ||
    !isSessionDelivery(value.delivery)
  ) {
    return undefined;
  }
  return {
    version: SESSION_MANIFEST_VERSION,
    key: { agentId, namespace, name, profileId },
    purpose: value.purpose,
    delivery: value.delivery,
  };
}

function isSessionDelivery(value: unknown): value is SessionDelivery {
  if (!isRecord(value)) return false;
  if (value.kind === "transcript") return true;
  return value.kind === "channel" && typeof value.channel === "string";
}

export function readSessionRecordedModel(
  cwd: string,
  sessionDir: string,
): ModelRef | undefined {
  try {
    const model = createSessionManager(cwd, sessionDir).buildSessionContext().model;
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
