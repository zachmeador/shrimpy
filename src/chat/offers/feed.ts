import type { Context } from "@earendil-works/chord";
import type { ChatEvent, Member } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { fitAnswer, MAX_PAGE, whole } from "../input/index.ts";
import type { Store } from "../store/index.ts";
import { nextEvent } from "./wait.ts";

/** The position of the newest event, which is where the log ends. */
export function head(store: Store): number {
  return store.transaction((tx) => tx.head());
}

/**
 * Events after `cursor` in the caller's channels, oldest first, up to a page.
 * With none to give it waits for the next one, and stops waiting if `context`
 * is cancelled. Every event is offered, the caller's own included, so what a
 * member reads is the whole conversation, and nothing is left out for any
 * reason: what an event means to a member is the member's to say.
 */
export async function feed(
  store: Store,
  caller: Member,
  cursor: unknown,
  limit: unknown,
  context: Context,
): Promise<ChatEvent[]> {
  const after = whole(cursor, "cursor", 0);
  const count = Math.min(whole(limit, "limit", 1), MAX_PAGE);
  while (true) {
    const events = store.transaction((tx) => {
      const newest = tx.head();
      // Positions are never reused, so a cursor past the end comes from
      // somewhere else; waiting on it would skip every event until then.
      if (after > newest) {
        refuse(`The cursor ${after} is past the newest event, ${newest}. Start again from head.`);
      }
      return fitAnswer(tx.eventsAfter(caller.id, after, count), "oldest");
    });
    if (events.length > 0) return events;
    // The read above and the watching below happen in one turn of the event
    // loop, and this process is the only writer, so no event can slip between.
    await nextEvent(store, context);
  }
}
