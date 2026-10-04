import { DEFAULT_MAX_FRAME_LENGTH } from "@earendil-works/pi-protocol";
import { MAX_MESSAGE_LENGTH, MAX_RECEIPT_DETAIL_LENGTH, type Message } from "../../contracts/chat/index.ts";

/** Characters in one message. */
export const MAX_TEXT = MAX_MESSAGE_LENGTH;

/** Characters in the detail of a failed receipt. */
export const MAX_DETAIL = MAX_RECEIPT_DETAIL_LENGTH;

/** Messages in one page of `read` or `feed`. Larger requests get a page this size. */
export const MAX_PAGE = 200;

/** Characters in a member's or a thread's name. */
export const MAX_NAME = 200;

/** Characters in an ID that a caller makes up: a member, a request. */
export const MAX_ID = 200;

/**
 * Bytes of messages in one answer: half a protocol frame, so an answer fits in
 * one frame whatever else the frame carries. One message of the longest allowed
 * size takes well under that, even with every character escaped.
 */
export const ANSWER_BYTES = DEFAULT_MAX_FRAME_LENGTH / 2;

/**
 * As many of `messages` as fit in one answer, counted from the `newest` or the
 * `oldest` end, and always at least one. Ordinary messages all fit; this
 * matters only for a page of very long ones.
 */
export function fitAnswer(
  messages: Message[],
  keep: "newest" | "oldest",
  budget: number = ANSWER_BYTES,
): Message[] {
  const fromKeptEnd = keep === "newest" ? messages.toReversed() : messages;
  let bytes = 0;
  let count = 0;
  for (const message of fromKeptEnd) {
    bytes += Buffer.byteLength(JSON.stringify(message));
    if (count > 0 && bytes > budget) break;
    count += 1;
  }
  return keep === "newest" ? messages.slice(messages.length - count) : messages.slice(0, count);
}
