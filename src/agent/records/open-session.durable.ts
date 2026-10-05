import { configure, type Tx } from "@earendil-works/pi-durable";
import { agentChange, type SessionDefaults } from "./defaults.durable.ts";
import { type SessionRecord, SessionsDoc, triggerSession } from "./documents.durable.ts";
import type { SessionPlace } from "./thread-of.durable.ts";

/**
 * Find the session that `place` says, or make it, in the commit `tx` belongs
 * to. A session that is made gets a conversation that follows the home, and its
 * record is written. What comes back is the session's record as this commit
 * writes it, so a change to it is part of the commit. A session that exists is
 * found as it is: `place` says only where a new one would be.
 */
export async function openSession(tx: Tx, defaults: SessionDefaults, place: SessionPlace): Promise<SessionRecord> {
  const sessions = (await tx.doc(SessionsDoc)).sessions;
  const address = "threadId" in place ? place.threadId : triggerSession(place.trigger);
  if (!Object.hasOwn(sessions, address)) {
    const conversationId = (await tx.createConversation({ ownership: { kind: "ownerless" } })).id;
    await configure(tx, conversationId, agentChange(defaults));
    sessions[address] =
      "threadId" in place
        ? { conversationId, channelId: place.channelId, unacted: [] }
        : { conversationId, channelId: null, trigger: place.trigger, unacted: [] };
  }
  return sessions[address]!;
}
