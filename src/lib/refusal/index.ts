/**
 * Refusing a call so that the reason reaches the caller, and telling a call
 * that was refused from one that failed. Anything else a service throws is
 * reported as an internal error without its message, so a server throws this
 * for what a caller should be told. It must not know which program refuses or
 * why.
 */
export { isRefusal } from "./is-refusal.ts";
export { refuse, Refusal } from "./refusal.ts";
