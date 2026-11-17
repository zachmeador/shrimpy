import { MAX_MESSAGE_LENGTH, MAX_RECEIPT_DETAIL_LENGTH } from "../../contracts/chat/index.ts";

/** Characters in one message. */
export const MAX_TEXT = MAX_MESSAGE_LENGTH;

/** Characters in the detail of a receipt. */
export const MAX_DETAIL = MAX_RECEIPT_DETAIL_LENGTH;

/** Messages or events in one page of `read` or `feed`. Larger requests get a page this size. */
export const MAX_PAGE = 200;

/** Members one call can name, when it makes a room or adds to one. */
export const MAX_MEMBERS = 200;

/** Characters in an ID that a caller makes up: a member, a request. */
export const MAX_ID = 200;

/**
 * Bytes of messages or events in one answer or one thread's messages: half of
 * the 16 MiB that Chord takes in one part from a link it doesn't trust, so they
 * always fit. One message of the longest allowed size takes well under that,
 * even with every character escaped.
 */
export const ANSWER_BYTES = 8 * 1024 * 1024;

/**
 * As many of `items`, messages or events, as fit in one answer, counted from
 * the `newest` or the `oldest` end, and always at least one. Ordinary ones all
 * fit; this matters only for a page of very long ones.
 */
export function fitAnswer<T>(items: T[], keep: "newest" | "oldest", budget: number = ANSWER_BYTES): T[] {
  const fromKeptEnd = keep === "newest" ? items.toReversed() : items;
  let bytes = 0;
  let count = 0;
  for (const item of fromKeptEnd) {
    bytes += Buffer.byteLength(JSON.stringify(item));
    if (count > 0 && bytes > budget) break;
    count += 1;
  }
  return keep === "newest" ? items.slice(items.length - count) : items.slice(0, count);
}
