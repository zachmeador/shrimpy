import type { Member } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { identifiers, MAX_PAGE, receipt as checkReceipt } from "../input/index.ts";
import { visibleEvent } from "./access.ts";
import type { ChatDeps } from "./deps.ts";

/**
 * Leave the caller's receipt on events, in place of any it left on them
 * before. Only an agent leaves receipts, and only on events in channels it
 * belongs to. A reply must be a message the caller wrote in the same thread as
 * the message each event names. If any event is refused, none gets the receipt.
 */
export function leaveReceipt(deps: ChatDeps, caller: Member, eventIds: unknown, given: unknown): void {
  if (caller.kind !== "agent") refuse("Only an agent can leave a receipt.");
  const ids = identifiers(eventIds, "eventIds", MAX_PAGE);
  const left = checkReceipt(given, "receipt");
  deps.store.transaction((tx) => {
    const reply = left.reply === null ? null : (tx.message(left.reply) ?? null);
    for (const id of ids) {
      const event = visibleEvent(tx, caller, id);
      if (left.reply !== null && (reply?.author.id !== caller.id || reply.threadId !== event.message.threadId)) {
        refuse(`${left.reply} is not a message you wrote in the same thread as ${id}.`);
      }
      tx.leaveReceipt(event, caller.id, { status: left.status, reply, detail: left.detail });
    }
  });
}
