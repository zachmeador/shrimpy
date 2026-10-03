/**
 * Offering a service to the clients of a Pi server: to each connection, or to
 * every connection that attaches a route. It must not know what a service
 * does or which program offers it.
 */
export { offerToConnection, offerToRoute, type RouteOffer } from "./offer.ts";
