/**
 * Offering the log of events to the members that ask: what came after a
 * member's place in its feed, at once. A member asks, so the chat server never
 * has to reach an agent, and one that was down catches up from its own place.
 * It offers every event and filters none. It must not know what a member does
 * with an event.
 */
export { events } from "./feed.ts";
