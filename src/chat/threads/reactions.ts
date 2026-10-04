import type { Member, Message } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { emoji as checkEmoji, identifier } from "../input/index.ts";
import { visibleMessage } from "./access.ts";
import type { ChatDeps } from "./deps.ts";

/**
 * Put an emoji on a message, as any member of its channel. A message that
 * was deleted takes none, and one the caller already put there stays as it is.
 */
export function react(deps: ChatDeps, caller: Member, messageId: unknown, emoji: unknown): Message {
  const id = identifier(messageId, "messageId");
  const reaction = checkEmoji(emoji, "emoji");
  return deps.store.transaction((tx) => {
    const { message } = visibleMessage(tx, caller, id);
    if (message.deleted) refuse("That message was deleted, so it takes no reactions.");
    return tx.addReaction(message, caller.id, reaction, deps.now());
  });
}

/** Take back the caller's emoji. Taking back one that is not there changes nothing. */
export function unreact(deps: ChatDeps, caller: Member, messageId: unknown, emoji: unknown): Message {
  const id = identifier(messageId, "messageId");
  const reaction = checkEmoji(emoji, "emoji");
  return deps.store.transaction((tx) => {
    const { message } = visibleMessage(tx, caller, id);
    return tx.removeReaction(message, caller.id, reaction, deps.now());
  });
}
