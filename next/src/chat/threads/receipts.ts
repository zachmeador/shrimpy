import type { Member } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { identifiers, MAX_PAGE, receipt as checkReceipt } from "../input/index.ts";
import { isMember } from "./access.ts";
import type { ChatDeps } from "./deps.ts";

/**
 * Leave the caller's receipt on messages, in place of any it left on them
 * before. Only an agent leaves receipts, and only on messages in channels it
 * belongs to. A reply must be a message the caller wrote in the same thread as
 * each message it answers. If any message is refused, none gets the receipt.
 */
export function leaveReceipt(deps: ChatDeps, caller: Member, messageIds: unknown, given: unknown): void {
  if (caller.kind !== "agent") refuse("Only an agent can leave a receipt.");
  const ids = identifiers(messageIds, "messageIds", MAX_PAGE);
  const left = checkReceipt(given, "receipt");
  deps.store.transaction((tx) => {
    const reply = left.reply === null ? null : (tx.message(left.reply) ?? null);
    for (const id of ids) {
      const message = tx.message(id);
      const channel = message === undefined ? undefined : tx.channel(message.channelId);
      if (message === undefined || channel === undefined || !isMember(channel, caller.id)) {
        refuse(`Unknown message: ${id}`);
      }
      if (left.reply !== null && (reply?.author.id !== caller.id || reply.threadId !== message.threadId)) {
        refuse(`${left.reply} is not a message you wrote in the same thread as ${id}.`);
      }
      tx.leaveReceipt(message, caller.id, { status: left.status, reply, detail: left.detail });
    }
  });
}
