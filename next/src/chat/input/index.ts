/**
 * What callers of the chat server may send: the size limits, the checks that
 * turn arguments off the wire into values the server can trust, and the
 * refusal a failed check raises. It must not know about the store, what a
 * member may see, or how the refusal travels.
 */
export {
  flag,
  identifier,
  identifiers,
  label,
  member,
  messageText,
  whole,
} from "./check.ts";
export { MAX_PAGE } from "./limits.ts";
export { refuse, Refusal } from "./refusal.ts";
