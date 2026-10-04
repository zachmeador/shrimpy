import type { Member, Message } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { identifier, messageText } from "../input/index.ts";
import { visibleMessage } from "./access.ts";
import { addressedMembers } from "./addressing.ts";
import type { ChatDeps } from "./deps.ts";
import { previewOf } from "./messages.ts";

/** Refuse anyone but the author, who is the only member that changes a message. */
function onlyAuthor(caller: Member, message: Message, doing: string): void {
  if (message.author.id !== caller.id) refuse(`Only the author of a message can ${doing} it.`);
}

/**
 * Change what a message says, as its author. The store writes the event with
 * the change, and writes neither when the message already says that, which
 * makes a retry of an edit harmless.
 */
export function editMessage(deps: ChatDeps, caller: Member, messageId: unknown, text: unknown): Message {
  const id = identifier(messageId, "messageId");
  const body = messageText(text);
  return deps.store.transaction((tx) => {
    const { message, channel } = visibleMessage(tx, caller, id);
    onlyAuthor(caller, message, "edit");
    if (message.deleted) refuse("That message was deleted, so it can't be edited.");
    return tx.editMessage(message, {
      actorId: caller.id,
      at: deps.now(),
      text: body,
      addressed: addressedMembers(channel, caller, body),
      preview: previewOf(body),
    });
  });
}

/** Delete a message, as its author. Deleting one that is deleted already changes nothing. */
export function deleteMessage(deps: ChatDeps, caller: Member, messageId: unknown): Message {
  const id = identifier(messageId, "messageId");
  return deps.store.transaction((tx) => {
    const { message } = visibleMessage(tx, caller, id);
    onlyAuthor(caller, message, "delete");
    return tx.deleteMessage(message, caller.id, deps.now());
  });
}
