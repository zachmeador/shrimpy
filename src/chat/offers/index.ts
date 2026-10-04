/**
 * Offering messages to the members that ask: where the log ends, and what came
 * after a member's cursor. A member asks, so the chat server never has to reach
 * an agent, and one that was down catches up from its own cursor. It must not
 * know what a member does with a message.
 */
export { feed, head } from "./feed.ts";
