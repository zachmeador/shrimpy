/**
 * Characters in one message. A thread view carries 200 messages and a protocol
 * frame holds 16 MiB, so even a view of maximum-size messages in three-byte
 * characters (200 x 20,000 x 3 = 12 MB) always fits in one frame.
 */
export const MAX_TEXT = 20_000;

/** Messages in one page of `read` or `feed`. Larger requests get a page this size. */
export const MAX_PAGE = 200;

/** Characters in a member's or a thread's name. */
export const MAX_NAME = 200;

/** Characters in an ID that a caller makes up: a member, a request. */
export const MAX_ID = 200;
