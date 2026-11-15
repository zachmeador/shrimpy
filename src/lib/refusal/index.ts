/**
 * Saying no on purpose from deep inside an operation: `refuse` throws a
 * `Refusal`, whose message is words for a person, and `isRefusal` tells one
 * from a failure at the edge, which answers with the words. It must not know
 * which program refuses, why, or how an answer travels.
 */
export { isRefusal, refuse, Refusal } from "./refusal.ts";
