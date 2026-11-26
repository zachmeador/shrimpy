import { type Member, type Message, titleOf, type WakeLine } from "../../contracts/chat/index.ts";
import { fitAnswer, identifier, MAX_PAGE, messageText, wakeLine as checkWakeLine, whole } from "../input/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
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
export function post(deps: ChatDeps, caller: Member, threadId: unknown, text: unknown, requestId: unknown, quiet = false): Message {
  const id = identifier(threadId, "thread");
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

/**
 * Show a wake line in a thread — a trigger that fired, a background command
 * event, or a watched agent settling — once for each request ID, as `once`
 * says. Only an agent writes wake lines. A wake line never counts as unread
 * and is told to nobody's devices.
 */
export function wakeLine(
  deps: ChatDeps,
  caller: Member,
  thread: unknown,
  rawWake: unknown,
  requestId: unknown,
): Message {
  if (caller.kind !== "agent") refuse("Only an agent writes wake lines.");
  const threadId = identifier(thread, "thread");
  const input = checkWakeLine(rawWake);
  const request = requestOf(requestId, "wake", threadId, JSON.stringify(input));
  return deps.store.transaction(
    (tx) =>
      once(tx, caller, request, () => {
        visibleThread(tx, caller, threadId);
        let wake: WakeLine;
        if (input.kind === "answer") {
          const from = tx.member(input.from) ?? refuse(`Unknown member: ${input.from}.`);
          const target = readableThread(tx, caller, input.thread);
          wake = {
            kind: "answer",
            from,
            thread: target.thread.id,
            title: titleOf(target.thread),
            status: input.status,
            at: input.at,
          };
        } else {
          wake = input;
        }
        return tx.appendMessage({ threadId, authorId: caller.id, text: "", sentAt: deps.now(), mentions: [], preview: "", wake });
      }).message,
  );
}

/** Messages of a thread in a channel the caller reads, whether or not it is in it. */
export function readMessages(
  deps: ChatDeps,
  caller: Member,
  threadId: unknown,
  beforeSeq: unknown,
  limit: unknown,
): Message[] {
  const id = identifier(threadId, "thread");
  const before = beforeSeq === null ? null : whole(beforeSeq, "before", 0);
  const count = Math.min(whole(limit, "limit", 1), MAX_PAGE);
  return deps.store.transaction((tx) => {
    readableThread(tx, caller, id);
    return fitAnswer(tx.messagesIn(id, before, count), "newest");
  });
}
