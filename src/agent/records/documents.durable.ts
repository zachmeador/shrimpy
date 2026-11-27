import { defineDoc } from "@earendil-works/pi-durable";
import type { TriggerDefinition } from "../../contracts/agent/node.ts";
import { newId } from "../../lib/ids/index.ts";
import { type Missed, type Outstanding, type Place, type Snapshot, threadOf, type Watch } from "../inputs/index.ts";
import { ContextRevisionsDoc, InputFactsDoc, RequestDetailDoc, RequestsIndexDoc } from "./request-docs.durable.ts";

/**
 * Shrimpy's own documents, kept in the engine's storage and written in the same
 * commits as the work they belong to.
 */

export const RecordsDoc = defineDoc<{ id: string }>({
  kind: "shrimpy.records",
  version: 3,
  scope: "session",
  initial: () => ({ id: newId("rec") }),
  checkpointWhen: () => false,
});

/**
 * A session of the agent. Every session sits behind one real thread, and keeps
 * what the model has yet to be shown for it: events skipped when work was
 * stopped, what woke it that it was never shown, where the agent last looked in the
 * thread, which breadcrumbs it was shown, and where the thread is.
 */
export type SessionRecord = {
  /** The engine's ID for the session. */
  conversationId: number;
  channelId: string;
  /** Events skipped when work was stopped: shown with the next event in the thread. Oldest first. */
  unacted: Snapshot[];
  /** What woke the session that it was never shown because the input was skipped. */
  missed: Missed[];
  /** The position of the newest event the agent took up in the thread. */
  looked?: number;
  /** Digest of each breadcrumb text shown to the session, by filename. */
  shown: Record<string, string>;
  /** Where the thread is, as chat last said. */
  place?: Place;
};

/** Every session the agent has, by its thread ID. */
export const SessionsDoc = defineDoc<{ sessions: Record<string, SessionRecord> }>({
  kind: "shrimpy.sessions",
  version: 4,
  scope: "session",
  initial: () => ({ sessions: {} }),
  migrate(value, fromVersion) {
    if (fromVersion === 3) {
      const raw = (value as { sessions?: Record<string, Record<string, unknown>> }).sessions ?? {};
      const sessions: Record<string, SessionRecord> = {};
      for (const [address, record] of Object.entries(raw)) {
        if (typeof record.channelId !== "string" || typeof record.conversationId !== "number") continue;
        sessions[address] = {
          conversationId: record.conversationId,
          channelId: record.channelId,
          unacted: Array.isArray(record.unacted) ? (record.unacted as Snapshot[]) : [],
          missed: [],
          ...(typeof record.looked === "number" ? { looked: record.looked } : {}),
          shown:
            typeof record.shown === "object" && record.shown !== null && !Array.isArray(record.shown)
              ? (record.shown as Record<string, string>)
              : {},
          ...(record.place !== undefined ? { place: record.place as Place } : {}),
        };
      }
      return { sessions };
    }
    throw new Error(`Unsupported shrimpy.sessions migration from version ${String(fromVersion)}`);
  },
  checkpointWhen: () => false,
});

/** The address of the session an input belongs to: its thread ID, or undefined for an unrun occurrence. */
export function sessionAddress(input: Outstanding): string | undefined {
  return threadOf(input)?.threadId;
}

/**
 * Live watches on other agents' replies in DM threads, keyed by watch ID.
 * A watch lives here from the post until the other agent settles, the DM
 * thread is archived, or the watch is cancelled.
 */
export const WatchesDoc = defineDoc<{ open: Record<string, Watch> }>({
  kind: "shrimpy.watches",
  version: 1,
  scope: "session",
  initial: () => ({ open: {} }),
  checkpointWhen: () => false,
});

/** A running background `bash` command persisted so restarts detect dead or orphaned processes. */
export type StoredProcess = {
  id: string;
  pid: number;
  pgid: number;
  threadId: string;
  channelId: string;
  command: string;
  startedAt: number;
  logPath: string;
  checkedIn?: boolean;
};

/** Running background `bash` commands, keyed by process ID. */
export const ProcessesDoc = defineDoc<{ running: Record<string, StoredProcess> }>({
  kind: "shrimpy.processes",
  version: 1,
  scope: "session",
  initial: () => ({ running: {} }),
  checkpointWhen: () => false,
});

/** A standing trigger the agent runs, with its schedule revision and check state. */
export type StoredTrigger = { revision: number; definition: TriggerDefinition; last?: string; checkedAt?: number; quiet?: number };

/** The agent's standing triggers by name. */
export const TriggersDoc = defineDoc<{ owner: number | null; revisions: number; triggers: Record<string, StoredTrigger> }>({
  kind: "shrimpy.triggers",
  version: 1,
  scope: "session",
  initial: () => ({ owner: null, revisions: 0, triggers: {} }),
  checkpointWhen: () => false,
});

/** Where the agent stands in chat's feed. */
export const FeedDoc = defineDoc<{ cursor: number | null; store: string | null }>({
  kind: "shrimpy.feed",
  version: 3,
  scope: "session",
  initial: () => ({ cursor: null, store: null }),
  checkpointWhen: () => false,
});

/** Every one of Shrimpy's own documents. */
export const DOCUMENTS = [
  RecordsDoc,
  SessionsDoc,
  WatchesDoc,
  ProcessesDoc,
  TriggersDoc,
  FeedDoc,
  ContextRevisionsDoc,
  RequestsIndexDoc,
  RequestDetailDoc,
  InputFactsDoc,
] as const;

/** A copy of something read from a document, safe to keep after the commit. */
export function copyOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
