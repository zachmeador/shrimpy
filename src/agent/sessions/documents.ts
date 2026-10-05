import { defineDoc } from "@earendil-works/pi-durable";
import type { Snapshot } from "../intake/index.ts";

/**
 * Shrimpy's own documents, kept in the engine's storage and written in the same
 * commits as the work they belong to. The engine has no place for these: which
 * thread a session belongs to, and where the agent stands in chat's feed.
 *
 * Their version rises when a home written under the old meaning must be refused
 * and not read as current: the engine refuses it, and `records.ts` says what to
 * do. A home written before every event had a task of its own keeps the events
 * it has not answered in a record that is no longer read, so reading it would
 * drop them.
 */

/** The session behind a thread, and the events in the thread the agent has not acted on. */
export type ThreadSession = {
  /** The engine's ID for the session. Only this module knows what it is. */
  conversationId: number;
  channelId: string;
  /** Events skipped when work was stopped: shown with the next event in the thread. Oldest first. */
  unacted: Snapshot[];
};

/** Every thread the agent takes part in, with its session. A session never changes its thread. */
export const ThreadsDoc = defineDoc<{ sessions: Record<string, ThreadSession> }>({
  kind: "shrimpy.threads",
  version: 3,
  scope: "session",
  initial: () => ({ sessions: {} }),
});

/** Where the agent stands in chat's feed: the position of the last event it is done with. */
export const FeedDoc = defineDoc<{ cursor: number | null }>({
  kind: "shrimpy.feed",
  version: 3,
  scope: "session",
  initial: () => ({ cursor: null }),
});

/** A plain copy of something read from a document, safe to keep after the commit. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
