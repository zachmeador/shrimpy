import { createHash } from "node:crypto";
import type { Member, Message } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { fitAnswer, identifier, MAX_PAGE, messageText, whole } from "../input/index.ts";
import { visibleThread } from "./access.ts";
import { addressedMembers } from "./addressing.ts";
import type { ChatDeps } from "./deps.ts";

const PREVIEW_LENGTH = 80;

/** The start of a text on one line, for a thread that has no name yet and for events that name a message. */
export function previewOf(text: string): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, PREVIEW_LENGTH).join("");
}

/**
 * What a post request said, as a digest. A message can be edited or deleted
 * after it is posted, so a retry is told from a different request that reuses
 * the ID by what the request said, not by what the message says now.
 */
const digestOf = (threadId: string, text: string): string =>
  createHash("sha256").update(threadId).update("\0").update(text).digest("hex");

/**
 * Post to a thread. A retry with the same request ID from the same member gets
 * the first message back, as it stands now. A request ID reused for a different
 * message is not a retry, and posting it again would hide the mistake, so it is
 * refused.
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
  const digest = digestOf(id, body);
  return deps.store.transaction((tx) => {
    const earlier = tx.postedBy(caller.id, request);
    if (earlier !== undefined) {
      if (earlier.digest !== digest) refuse(`Request ${request} already posted a different message.`);
      return earlier.message;
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
      digest,
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
