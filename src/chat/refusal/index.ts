/**
 * Saying no on purpose from deep inside an operation: `refuse` throws the
 * contract's refusal, and `answer` turns it into the method's answer at the
 * edge, so a caller always gets words and never a failure for a no. Anything
 * else thrown stays a failure. It must not know why anything is refused.
 */
export { answer, refuse } from "./refusal.ts";
