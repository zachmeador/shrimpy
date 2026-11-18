import { createHash } from "node:crypto";
import type { Member, Message } from "../../contracts/chat/index.ts";
import { fitAnswer, identifier, MAX_PAGE, messageText, whole } from "../input/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { cutEnd, singleSpaced } from "../../lib/text/index.ts";
import { readableThread, visibleThread } from "./access.ts";
import type { ChatDeps } from "./deps.ts";
import { mentionedMembers } from "./mentions.ts";

const PREVIEW_LENGTH = 80;

/** The start of a text on one line, for a thread that has no name yet and for events that name a message. */
export function previewOf(text: string): string {
  return cutEnd(singleSpaced(text), PREVIEW_LENGTH, { unit: "characters" });
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
export function post(deps: ChatDeps, caller: Member, threadId: string, text: unknown, requestId: unknown): Message {
  const id = threadId;
  const body = messageText(text);
  const request = identifier(requestId, "request");
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
      mentions: mentionedMembers(channel, caller, body),
      requestId: request,
      preview: previewOf(body),
      digest,
    });
  });
}

/** Messages of a thread in a channel the caller reads, whether or not it is in it. */
export function readMessages(
  deps: ChatDeps,
  caller: Member,
  threadId: string,
  beforeSeq: unknown,
  limit: unknown,
): Message[] {
  const id = threadId;
  const before = beforeSeq === null ? null : whole(beforeSeq, "before", 0);
  const count = Math.min(whole(limit, "limit", 1), MAX_PAGE);
  return deps.store.transaction((tx) => {
    readableThread(tx, caller, id);
    return fitAnswer(tx.messagesIn(id, before, count), "newest");
  });
}
