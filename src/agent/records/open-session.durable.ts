import { configure, type Tx } from "@earendil-works/pi-durable";
import type { SessionDefaults } from "./defaults.durable.ts";
import { type SessionRecord, SessionsDoc } from "./documents.durable.ts";
import type { SessionThread } from "./thread-of.durable.ts";

/**
 * Find the session behind `thread`, or make it, in the commit `tx` belongs to.
 */
export async function openSession(tx: Tx, defaults: SessionDefaults, thread: SessionThread): Promise<SessionRecord> {
  const sessions = (await tx.doc(SessionsDoc)).sessions;
  if (!Object.hasOwn(sessions, thread.threadId)) {
    const conversationId = (await tx.createConversation({ ownership: { kind: "ownerless" } })).id;
    await configure(tx, conversationId, defaults);
    sessions[thread.threadId] = {
      conversationId,
      channelId: thread.channelId,
      unacted: [],
      missed: [],
      shown: {},
    };
  }
  return sessions[thread.threadId]!;
}
