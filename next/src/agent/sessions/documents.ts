import { defineDoc } from "@earendil-works/pi-durable";
import type { Outstanding, Snapshot } from "../intake/index.ts";

/**
 * Shrimpy's own documents, kept in the engine's storage and written in the same
 * commits as the work they belong to. The engine has no place for these: which
 * thread a session belongs to, what the agent has picked up and still owes a
 * receipt for, and where it stands in chat's feed.
 */

/** The session behind a thread, and the messages in the thread the agent has not acted on. */
export type ThreadSession = {
  /** The engine's ID for the session. Only this module knows what it is. */
  conversationId: number;
  channelId: string;
  /** Messages skipped when work was stopped: shown with the next message in the thread. Oldest first. */
  unacted: Snapshot[];
};

/** Every thread the agent takes part in, with its session. A session never changes its thread. */
export const ThreadsDoc = defineDoc<{ sessions: Record<string, ThreadSession> }>({
  kind: "shrimpy.threads",
  version: 1,
  scope: "session",
  initial: () => ({ sessions: {} }),
});

/** The outbox: the messages picked up, by ID, until the receipt on each is left. */
export const OutboxDoc = defineDoc<{ entries: Record<string, Outstanding> }>({
  kind: "shrimpy.outbox",
  version: 1,
  scope: "session",
  initial: () => ({ entries: {} }),
});

/** Where the agent stands in chat's feed: the position of the last message it is done with. */
export const FeedDoc = defineDoc<{ cursor: number | null }>({
  kind: "shrimpy.feed",
  version: 1,
  scope: "session",
  initial: () => ({ cursor: null }),
});

/** A plain copy of something read from a document, safe to keep after the commit. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
