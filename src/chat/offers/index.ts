/**
 * Offering the log of events to the members that ask: where it ends, and what
 * came after a member's cursor. A member asks, so the chat server never has to
 * reach an agent, and one that was down catches up from its own cursor. It
 * offers every event and filters none. It must not know what a member does
 * with an event.
 */
export { feed, head } from "./feed.ts";
