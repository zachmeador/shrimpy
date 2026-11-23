import type { Member, Message } from "../../contracts/chat/index.ts";
import { fitAnswer, MAX_PAGE, messageText, whole } from "../input/index.ts";
import { cutEnd, singleSpaced } from "../../lib/text/index.ts";
import { readableThread, visibleThread } from "./access.ts";
import type { ChatDeps } from "./deps.ts";
import { mentionedMembers } from "./mentions.ts";
import { once, requestOf } from "./requests.ts";

const PREVIEW_LENGTH = 80;

/** The start of a text on one line, for a thread that has no name yet and for events that name a message. */
export function previewOf(text: string): string {
  return cutEnd(singleSpaced(text), PREVIEW_LENGTH, { unit: "characters" });
}

/**
 * Post to a thread, once for each request ID, as `once` says. A new message
 * that isn't `quiet` may be worth telling you.
 */
export function post(deps: ChatDeps, caller: Member, threadId: string, text: unknown, requestId: unknown, quiet = false): Message {
  const id = threadId;
  const body = messageText(text);
  const request = requestOf(requestId, id, body);
  const posted = deps.store.transaction((tx) =>
    once(tx, caller, request, () => {
      const { channel } = visibleThread(tx, caller, id);
      return tx.appendMessage({
        threadId: id,
        authorId: caller.id,
        text: body,
        sentAt: deps.now(),
        mentions: mentionedMembers(channel, caller, body),
        preview: previewOf(body),
      });
    }),
  );
  if (!posted.retry && !quiet) deps.notifier.posted(posted.message);
  return posted.message;
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
