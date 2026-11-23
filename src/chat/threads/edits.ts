import type { Member, Message } from "../../contracts/chat/index.ts";
import { identifier, messageText } from "../input/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { visibleMessage } from "./access.ts";
import type { ChatDeps } from "./deps.ts";
import { mentionedMembers } from "./mentions.ts";
import { previewOf } from "./messages.ts";
import { once, requestOf } from "./requests.ts";

/** Refuse anyone but the author, who is the only member that changes a message. */
function onlyAuthor(caller: Member, message: Message, doing: string): void {
  if (message.author.id !== caller.id) refuse(`Only the author of a message can ${doing} it.`);
}

/**
 * Change what a message says, as its author, once for each request ID. The
 * store writes the event with the change, and writes neither when the message
 * already says that. Which members the message mentions is worked out again
 * from the new text.
 */
export function editMessage(
  deps: ChatDeps,
  caller: Member,
  threadId: string,
  messageId: unknown,
  text: unknown,
  requestId: unknown,
): Message {
  const id = identifier(messageId, "message");
  const body = messageText(text);
  const request = requestOf(requestId, "edit", threadId, id, body);
  return deps.store.transaction(
    (tx) =>
      once(tx, caller, request, () => {
        const { message, channel } = visibleMessage(tx, caller, threadId, id);
        onlyAuthor(caller, message, "edit");
        if (message.deleted) refuse("That message was deleted, so it can't be edited.");
        return tx.editMessage(message, {
          actorId: caller.id,
          at: deps.now(),
          text: body,
          mentions: mentionedMembers(channel, caller, body),
          preview: previewOf(body),
        });
      }).message,
  );
}

/** Delete a message, as its author, once for each request ID. Deleting one that is deleted already changes nothing. */
export function deleteMessage(deps: ChatDeps, caller: Member, threadId: string, messageId: unknown, requestId: unknown): Message {
  const id = identifier(messageId, "message");
  const request = requestOf(requestId, "delete", threadId, id);
  return deps.store.transaction(
    (tx) =>
      once(tx, caller, request, () => {
        const { message } = visibleMessage(tx, caller, threadId, id);
        onlyAuthor(caller, message, "delete");
        return tx.deleteMessage(message, caller.id, deps.now());
      }).message,
  );
}
