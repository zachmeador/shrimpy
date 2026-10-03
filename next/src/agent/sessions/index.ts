/**
 * Sessions as clients see them. This is the one place that turns the engine's
 * records into the contract's session view, so nothing outside it depends on
 * those record shapes. It must not know about transports or chat.
 */
export { publishSessionView } from "./publish.ts";
export { findSession, listSessions, type ServedSession, serveSession } from "./service.ts";
export { toSessionView } from "./session-view.ts";
