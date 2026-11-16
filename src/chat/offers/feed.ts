import type { ChatEvent, Member } from "../../contracts/chat/index.ts";
import { fitAnswer, MAX_PAGE, whole } from "../input/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import type { Store } from "../store/index.ts";

/**
 * Events after `after` in the caller's channels, oldest first, up to a page, at
 * once, and maybe none. Every event is offered, the caller's own included, so
 * what a member reads is the whole conversation, and nothing is left out for
 * any reason: what an event means to a member is the member's to say.
 */
export function events(store: Store, caller: Member, after: unknown, limit: unknown): ChatEvent[] {
  const place = whole(after, "after", 0);
  const count = Math.min(whole(limit, "limit", 1), MAX_PAGE);
  return store.transaction((tx) => {
    const head = tx.headOf(caller.id, 0);
    // A place is a position the caller was offered, so one past its head comes from somewhere else, such as a
    // store that went back to an earlier state, and reading on from it would pass over every event until then.
    if (place > head) refuse(`The position ${place} is past the newest event in your channels, ${head}. Start again from head.`);
    return fitAnswer(tx.eventsAfter(caller.id, place, count), "oldest");
  });
}
