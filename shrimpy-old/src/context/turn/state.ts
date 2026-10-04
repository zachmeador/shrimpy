import { join } from "node:path";
import type { AppRuntime } from "../../app/runtime.js";
import { withFileTransactionLock } from "../../util/file-lock.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../../util/json-file.js";
import type { TurnContextItem } from "./types.js";

const MAX_ACTIVITY_ENTRIES = 200;
const MAX_SEEN_ITEMS_PER_SESSION = 256;

export interface ContextTurnProducerState {
  lastRunAt?: number;
  items?: TurnContextItem[];
}

export interface AgentActivityEntry {
  sequence: number;
  sessionId: string;
  sessionLabel: string;
  at: string;
  summary: string;
  inspect: string;
}

export interface SessionContextState {
  activityCursor?: number;
  seenItems: Record<string, string>;
}

export interface ContextState {
  channels: Record<string, { lastSeenMessageId?: string }>;
  producers: Record<string, ContextTurnProducerState>;
  sessions: Record<string, SessionContextState>;
  activity: AgentActivityEntry[];
  nextActivitySequence: number;
}

export function contextTurnProducerStateKey(
  producerId: string,
  channel: string | undefined,
  sessionType: string,
): string {
  return JSON.stringify([producerId, channel ?? null, sessionType]);
}

function emptyState(): ContextState {
  return {
    channels: {},
    producers: {},
    sessions: {},
    activity: [],
    nextActivitySequence: 1,
  };
}

function parseState(raw: unknown): ContextState {
  const parsed = typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const channels = typeof parsed.channels === "object" && parsed.channels !== null
      && !Array.isArray(parsed.channels)
    ? parsed.channels as Record<string, unknown>
    : {};
  const producers = typeof parsed.producers === "object" && parsed.producers !== null
      && !Array.isArray(parsed.producers)
    ? parsed.producers as Record<string, unknown>
    : {};
  const sessions = typeof parsed.sessions === "object" && parsed.sessions !== null
      && !Array.isArray(parsed.sessions)
    ? parsed.sessions as Record<string, unknown>
    : {};
  const activity = Array.isArray(parsed.activity)
    ? parsed.activity.flatMap((entry) => {
      const result = parseActivityEntry(entry);
      return result ? [result] : [];
    })
    : [];
  const highestActivitySequence = activity.reduce(
    (highest, entry) => Math.max(highest, entry.sequence),
    0,
  );

  return {
    channels: Object.fromEntries(
      Object.entries(channels).map(([channel, value]) => {
        const obj = typeof value === "object" && value !== null && !Array.isArray(value)
          ? value as Record<string, unknown>
          : {};
        return [
          channel,
          {
            lastSeenMessageId: typeof obj.lastSeenMessageId === "string"
              ? obj.lastSeenMessageId
              : undefined,
          },
        ];
      }),
    ),
    producers: Object.fromEntries(
      Object.entries(producers).map(([id, value]) => {
        const obj = typeof value === "object" && value !== null && !Array.isArray(value)
          ? value as Record<string, unknown>
          : {};
        return [
          id,
          {
            lastRunAt: typeof obj.lastRunAt === "number" ? obj.lastRunAt : undefined,
            items: parseItems(obj.items),
          },
        ];
      }),
    ),
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([sessionId, value]) => {
        const obj = typeof value === "object" && value !== null && !Array.isArray(value)
          ? value as Record<string, unknown>
          : {};
        const seenItems = typeof obj.seenItems === "object" && obj.seenItems !== null
            && !Array.isArray(obj.seenItems)
          ? Object.fromEntries(
            Object.entries(obj.seenItems)
              .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
          )
          : {};
        return [
          sessionId,
          {
            activityCursor: typeof obj.activityCursor === "number"
              && Number.isSafeInteger(obj.activityCursor)
              && obj.activityCursor >= 0
              ? obj.activityCursor
              : undefined,
            seenItems,
          },
        ];
      }),
    ),
    activity,
    nextActivitySequence: typeof parsed.nextActivitySequence === "number"
        && Number.isSafeInteger(parsed.nextActivitySequence)
        && parsed.nextActivitySequence > highestActivitySequence
      ? parsed.nextActivitySequence
      : highestActivitySequence + 1,
  };
}

export function contextStatePath(runtime: AppRuntime, agentId: string): string {
  return join(runtime.paths.runtimeContextDir, `${agentId}.json`);
}

export function contextStatePathForWorkspace(
  workspacePath: string,
  agentId: string,
): string {
  return join(workspacePath, "runtime", "context", `${agentId}.json`);
}

export function readContextState(
  runtime: AppRuntime,
  agentId: string,
): ContextState {
  return readContextStatePath(contextStatePath(runtime, agentId));
}

export function updateContextState(
  runtime: AppRuntime,
  agentId: string,
  update: (state: ContextState) => void,
): ContextState {
  return updateContextStatePath(contextStatePath(runtime, agentId), update);
}

export function updateContextStateForWorkspace(
  workspacePath: string,
  agentId: string,
  update: (state: ContextState) => void,
): ContextState {
  return updateContextStatePath(
    contextStatePathForWorkspace(workspacePath, agentId),
    update,
  );
}

function parseItems(raw: unknown): TurnContextItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw.flatMap((item): TurnContextItem[] => {
    const obj = typeof item === "object" && item !== null && !Array.isArray(item)
      ? item as Record<string, unknown>
      : null;
    if (!obj || typeof obj.id !== "string" || typeof obj.summary !== "string") {
      return [];
    }
    return [{
      id: obj.id,
      summary: obj.summary,
      inspect: typeof obj.inspect === "string" ? obj.inspect : undefined,
      revision: typeof obj.revision === "string" ? obj.revision : undefined,
    }];
  });
  return items;
}

export function markChannelSeen(
  runtime: AppRuntime,
  agentId: string,
  channel: string,
  messageId: string,
): void {
  updateContextState(runtime, agentId, (state) => {
    state.channels[channel] = { lastSeenMessageId: messageId };
  });
}

export function appendAgentActivity(
  workspacePath: string,
  agentId: string,
  entries: Array<Omit<AgentActivityEntry, "sequence">>,
): AgentActivityEntry[] {
  if (entries.length === 0) return [];
  const appended: AgentActivityEntry[] = [];
  updateContextStateForWorkspace(workspacePath, agentId, (state) => {
    for (const entry of entries) {
      const stored = {
        ...entry,
        sequence: state.nextActivitySequence,
      };
      state.nextActivitySequence += 1;
      state.activity.push(stored);
      appended.push(stored);
    }
    if (state.activity.length > MAX_ACTIVITY_ENTRIES) {
      state.activity.splice(0, state.activity.length - MAX_ACTIVITY_ENTRIES);
    }
  });
  return appended;
}

export function rememberSessionContextDelivery(
  runtime: AppRuntime,
  agentId: string,
  sessionId: string,
  input: {
    activityCursor?: number;
    seenItems: Record<string, string>;
  },
): void {
  updateContextState(runtime, agentId, (state) => {
    const session = state.sessions[sessionId] ?? { seenItems: {} };
    if (input.activityCursor !== undefined) {
      session.activityCursor = Math.max(
        session.activityCursor ?? 0,
        input.activityCursor,
      );
    }
    for (const [id, fingerprint] of Object.entries(input.seenItems)) {
      delete session.seenItems[id];
      session.seenItems[id] = fingerprint;
    }
    const ids = Object.keys(session.seenItems);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SEEN_ITEMS_PER_SESSION))) {
      delete session.seenItems[id];
    }
    state.sessions[sessionId] = session;
  });
}

function readContextStatePath(path: string): ContextState {
  return readJsonFile(path, emptyState, parseState);
}

function updateContextStatePath(
  path: string,
  update: (state: ContextState) => void,
): ContextState {
  return withFileTransactionLock(path, () => {
    const state = readContextStatePath(path);
    update(state);
    writeJsonFileAtomic(path, state);
    return state;
  });
}

function parseActivityEntry(raw: unknown): AgentActivityEntry | undefined {
  const obj = typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : undefined;
  if (
    !obj
    || typeof obj.sequence !== "number"
    || !Number.isSafeInteger(obj.sequence)
    || obj.sequence < 1
    || typeof obj.sessionId !== "string"
    || typeof obj.sessionLabel !== "string"
    || typeof obj.at !== "string"
    || typeof obj.summary !== "string"
    || typeof obj.inspect !== "string"
  ) {
    return undefined;
  }
  return {
    sequence: obj.sequence,
    sessionId: obj.sessionId,
    sessionLabel: obj.sessionLabel,
    at: obj.at,
    summary: obj.summary,
    inspect: obj.inspect,
  };
}
