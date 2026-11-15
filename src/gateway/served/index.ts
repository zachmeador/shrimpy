/**
 * What the gateway serves its callers: `Roster`, one for each caller, with its
 * members, the programs linked now and the ways in the caller may see, kept
 * live from a view of the roster and the programs; and what each caller may do
 * with it, checked against the roster as it is now. It must not know how a
 * caller linked in.
 */
export { type Actions, type ActionsDeps, createActions } from "./actions.ts";
export { gatewayFacet } from "./facet.ts";
export { createView, type GatewayView, type View } from "./view.ts";
