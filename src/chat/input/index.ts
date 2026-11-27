/**
 * What callers of the chat server may send, and how much it sends back in one
 * answer: the size limits, and the checks that turn arguments off the wire into
 * values the server can trust or refuse them. It must not know about the
 * store, what a member may see, or how a refusal travels.
 */
export {
  emoji,
  flag,
  identifier,
  identifiers,
  label,
  messageText,
  receipt,
  searchQuery,
  wakeLine,
  whole,
} from "./check.ts";
export { ANSWER_BYTES, DEFAULT_SEARCH_LIMIT, fitAnswer, MAX_MEMBERS, MAX_PAGE, MAX_SEARCH_LIMIT } from "./limits.ts";
