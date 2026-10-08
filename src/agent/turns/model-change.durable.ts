import { AgentDoc, AssistantEntry, type ConversationId, type Cursor, type Tx } from "@earendil-works/pi-durable";
import type { ModelChange } from "../inputs/index.ts";

/** How many entries of a session are read at a time, newest first, while looking for its last answer. */
const PAGE = 20;

/**
 * Whether the model that wrote the last answer of a session is not the one the
 * session uses now, and which two they are. An answer stores the provider and
 * the model that wrote it, and the session's agent document the model its next
 * request names, so comparing them says so whatever changed the model: a
 * command in the thread, a reload that found the home naming another model, or
 * a start with another one. Nothing is kept for it, and once the next answer is
 * written by the model that runs on, there is nothing to tell. A session that has
 * never answered has nothing to tell either, and neither has one whose last
 * request failed, since the model it named wrote nothing. Read in the commit `tx`
 * belongs to, before it writes a table.
 */
export async function modelChangeOf(tx: Tx, conversationId: ConversationId): Promise<ModelChange | undefined> {
  const now = (await tx.doc(AgentDoc, conversationId)).model;
  if (now === undefined) return undefined;
  let cursor: Cursor | undefined;
  do {
    const page = await tx.scanEntries({ conversationId }, PAGE, cursor);
    for (const entry of page.items) {
      const answer = AssistantEntry.is(entry) ? entry.model?.[0] : undefined;
      if (answer?.role !== "assistant" || answer.stopReason === "error") continue;
      if (answer.provider === now.provider && answer.model === now.modelId) return undefined;
      return { was: { provider: answer.provider, id: answer.model }, now: { provider: now.provider, id: now.modelId } };
    }
    cursor = page.next;
  } while (cursor !== undefined);
  return undefined;
}
