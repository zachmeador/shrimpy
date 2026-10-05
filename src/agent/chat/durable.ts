/**
 * The one part of the agent's side of chat that needs the engine: what takes a
 * chat event up as an input of its thread's session, in one commit with the move
 * of the agent's place in the feed, keeps which chat store that place is in, and
 * answers where the agent last looked in a thread. The stop of a session's work
 * is handed in, since the sessions are above chat. It must not know how the feed
 * is read or which events wake the agent.
 */
export { createAdmissions } from "./admissions.durable.ts";
