import type { Member, Message } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import {
  fitAnswer,
  identifier,
  identifiers,
  MAX_PAGE,
  messageText,
  whole,
} from "../input/index.ts";
import { isMember, visibleThread } from "./access.ts";
import { addressedMembers } from "./addressing.ts";
import type { ChatDeps } from "./deps.ts";

const PREVIEW_LENGTH = 80;

/** The start of a message on one line, for a thread that has no name yet. */
export function previewOf(text: string): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, PREVIEW_LENGTH).join("");
}

/**
 * Post to a thread. A retry with the same request ID from the same member gets
 * the first message back. A request ID reused for a different message is not a
 * retry, and posting it again would hide the mistake, so it is refused.
 */
export function post(
  deps: ChatDeps,
  caller: Member,
  threadId: unknown,
  text: unknown,
  requestId: unknown,
): Message {
  const id = identifier(threadId, "threadId");
  const body = messageText(text);
  const request = identifier(requestId, "requestId");
  return deps.store.transaction((tx) => {
    const earlier = tx.postedBy(caller.id, request);
    if (earlier !== undefined) {
      if (earlier.threadId !== id || earlier.text !== body) {
        refuse(`Request ${request} already posted a different message.`);
      }
      return earlier;
    }
    const { channel } = visibleThread(tx, caller, id);
    return tx.appendMessage({
      threadId: id,
      authorId: caller.id,
      text: body,
      sentAt: deps.now(),
      addressed: addressedMembers(channel, caller, body),
      requestId: request,
      preview: previewOf(body),
    });
  });
}

export function readMessages(
  deps: ChatDeps,
  caller: Member,
  threadId: unknown,
  beforeSeq: unknown,
  limit: unknown,
): Message[] {
  const id = identifier(threadId, "threadId");
  const before = beforeSeq === null ? null : whole(beforeSeq, "beforeSeq", 0);
  const count = Math.min(whole(limit, "limit", 1), MAX_PAGE);
  return deps.store.transaction((tx) => {
    visibleThread(tx, caller, id);
    return fitAnswer(tx.messagesIn(id, before, count), "newest");
  });
}

/** Note that an agent had these messages waiting when its work was stopped. */
export function markSkipped(deps: ChatDeps, caller: Member, messageIds: unknown): void {
  if (caller.kind !== "agent") refuse("Only an agent can mark messages skipped.");
  const ids = identifiers(messageIds, "messageIds", MAX_PAGE);
  deps.store.transaction((tx) => {
    for (const id of ids) {
      const message = tx.message(id);
      const channel = message === undefined ? undefined : tx.channel(message.channelId);
      if (message === undefined || channel === undefined || !isMember(channel, caller.id)) {
        refuse(`Unknown message: ${id}`);
      }
      tx.markSkipped(message, caller.id);
    }
  });
}
