/**
 * What callers of the chat server may send, and how much it sends back in one
 * answer: the size limits, and the checks that turn arguments off the wire into
 * values the server can trust or refuse them. It must not know about the
 * store, what a member may see, or how a refusal travels.
 */
export {
  flag,
  identifier,
  identifiers,
  label,
  member,
  messageText,
  receipt,
  whole,
} from "./check.ts";
export { ANSWER_BYTES, fitAnswer, MAX_PAGE } from "./limits.ts";
