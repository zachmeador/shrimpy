/**
 * Refusing a call so that the reason reaches the caller, and telling a call
 * that was refused from one that failed. Anything else a service throws is
 * reported as an internal error without its message, so a server throws this
 * for what a caller should be told. A refusal can also say which case it is, in
 * a reason, so that a caller never has to read that out of the message. A
 * program that has no such call, being another version, is told apart from one
 * that refuses. It must not know which program refuses or why.
 */
export { isRefusal, isUnknownCall, reasonOf } from "./is-refusal.ts";
export { refuse, Refusal } from "./refusal.ts";
