import type { Context } from "@earendil-works/chord";
import type { Member, Message } from "../../contracts/chat/index.ts";
import { MAX_PAGE, refuse, whole } from "../input/index.ts";
import type { Store } from "../store/index.ts";
import { nextMessage } from "./wait.ts";

/** The position of the newest message, where a member with no cursor starts. */
export function head(store: Store): number {
  return store.transaction((tx) => tx.head());
}

/**
 * Messages after `cursor` in the caller's channels, oldest first, up to a page.
 * With none to give it waits for the next one, and stops waiting if `context`
 * is cancelled. The messages include the caller's own, so what a member reads
 * is the whole conversation.
 */
export async function feed(
  store: Store,
  caller: Member,
  cursor: unknown,
  limit: unknown,
  context: Context,
): Promise<Message[]> {
  const after = whole(cursor, "cursor", 0);
  const count = Math.min(whole(limit, "limit", 1), MAX_PAGE);
  while (true) {
    const messages = store.transaction((tx) => {
      const newest = tx.head();
      // Positions are never reused, so a cursor past the end comes from
      // somewhere else; waiting on it would skip every message until then.
      if (after > newest) {
        refuse(`The cursor ${after} is past the newest message, ${newest}. Start again from head.`);
      }
      return tx.messagesAfter(caller.id, after, count);
    });
    if (messages.length > 0) return messages;
    // The read above and the watching below happen in one turn of the event
    // loop, and this process is the only writer, so no post can slip between.
    await nextMessage(store, context);
  }
}
