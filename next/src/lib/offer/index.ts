/**
 * Offering a service to the clients of a Pi server: to each connection, or to
 * every connection that attaches a session. It must not know what a service
 * does or which program offers it.
 */
export { offerToConnection, offerToSession, type SessionOffer } from "./offer.ts";
