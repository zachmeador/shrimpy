import { filesWords, MAX_ATTACHED_BYTES, type Member, type Message, type SearchHit, titleOf, type WakeLine } from "../../contracts/chat/index.ts";
import {
  attachmentIds,
  DEFAULT_SEARCH_LIMIT,
  fitAnswer,
  identifier,
  MAX_PAGE,
  MAX_SEARCH_LIMIT,
  messageText,
  searchQuery,
  textWithFiles,
  wakeLine as checkWakeLine,
  whole,
} from "../input/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { cutEnd, singleSpaced, sizeWords } from "../../lib/text/index.ts";
import { readableChannel, readableThread, readsOthers, visibleThread } from "./access.ts";
import { finishedUploads } from "./attachments.ts";
import type { ChatDeps } from "./deps.ts";
import { mentionedMembers } from "./mentions.ts";
import { once, requestOf } from "./requests.ts";

const PREVIEW_LENGTH = 80;

/** The start of a text on one line, for a thread that has no name yet and for events that name a message. */
export function previewOf(text: string): string {
  return cutEnd(singleSpaced(text), PREVIEW_LENGTH, { unit: "characters" });
}

/**
 * Post to a thread, once for each request ID, as `once` says, with the
 * caller's finished uploads that `attachments` names as its files. A message
 * with files needs no text, and one with none shows their names where its text
 * would start. A new message that isn't `quiet` may be worth telling you.
 */
export function post(
  deps: ChatDeps,
  caller: Member,
  threadId: unknown,
  text: unknown,
  requestId: unknown,
  quiet = false,
  attachments?: unknown,
): Message {
  const id = identifier(threadId, "thread");
  const files = attachmentIds(attachments);
  const body = files.length === 0 ? messageText(text) : textWithFiles(text);
  const request = requestOf(requestId, id, body, ...files);
  const posted = deps.store.transaction((tx) =>
    once(tx, caller, request, () => {
      const { channel } = visibleThread(tx, deps, caller, id);
      const uploads = finishedUploads(tx, caller, files);
      const total = uploads.reduce((sum, file) => sum + file.size, 0);
      if (total > MAX_ATTACHED_BYTES) {
        refuse(`A message carries files of at most ${sizeWords(MAX_ATTACHED_BYTES)} in all, and these are ${sizeWords(total)}.`);
      }
      return tx.appendMessage({
        threadId: id,
        authorId: caller.id,
        text: body,
        sentAt: deps.now(),
        mentions: mentionedMembers(channel, caller, body),
        preview: previewOf(body.trim() === "" ? filesWords(uploads) : body),
        attachments: files,
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
        visibleThread(tx, deps, caller, threadId);
        let wake: WakeLine;
        if (input.kind === "answer") {
          const from = tx.member(input.from) ?? refuse(`Unknown member: ${input.from}.`);
          const target = readableThread(tx, deps, caller, input.thread);
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
    readableThread(tx, deps, caller, id);
    return fitAnswer(tx.messagesIn(id, before, count), "newest");
  });
}

/** Messages of a thread centered around `seq`, oldest first. */
export function readAround(
  deps: ChatDeps,
  caller: Member,
  threadId: unknown,
  seq: unknown,
  limit: unknown,
): Message[] {
  const id = identifier(threadId, "thread");
  const target = whole(seq, "seq", 0);
  const count = Math.min(whole(limit, "limit", 1), MAX_PAGE);
  return deps.store.transaction((tx) => {
    readableThread(tx, deps, caller, id);
    return fitAnswer(tx.messagesAround(id, target, count), "newest");
  });
}

/** Search non-deleted messages matching `query` across channels the caller may read, newest first. */
export function searchMessages(
  deps: ChatDeps,
  caller: Member,
  query: unknown,
  channelId: unknown,
  threadId: unknown,
  limit: unknown,
): SearchHit[] {
  const terms = searchQuery(query);
  const channel = channelId === undefined ? undefined : identifier(channelId, "channel");
  const thread = threadId === undefined ? undefined : identifier(threadId, "thread");
  const count = limit === undefined ? DEFAULT_SEARCH_LIMIT : Math.min(whole(limit, "limit", 1), MAX_SEARCH_LIMIT);
  return deps.store.transaction((tx) => {
    if (channel !== undefined) readableChannel(tx, deps, caller, channel);
    if (thread !== undefined) {
      const found = readableThread(tx, deps, caller, thread);
      if (channel !== undefined && found.channel.id !== channel) refuse(`Thread ${thread} is not in channel ${channel}.`);
    }
    const hits = tx.searchMessages({
      memberId: caller.id,
      readsAll: readsOthers(deps, caller),
      terms,
      ...(channel === undefined ? {} : { channelId: channel }),
      ...(thread === undefined ? {} : { threadId: thread }),
      limit: count,
    });
    // Hits are newest first, so keeping from the front keeps the newest matches.
    return fitAnswer(hits, "oldest");
  });
}
