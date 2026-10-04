/**
 * Offering a service to the clients of a Pi server: to each connection, or to
 * every connection that attaches a route, and telling an error that only says
 * a client went away from one worth reporting. It must not know what a
 * service does or which program offers it.
 */
export { isClientGone } from "./client-gone.ts";
export { offerToConnection, offerToRoute, type RouteOffer } from "./offer.ts";
