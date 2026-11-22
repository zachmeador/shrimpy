/**
 * What the gateway serves its callers: `Roster`, one for each caller, with its
 * members, the programs linked now and the ways in the caller may see, kept
 * live from a view of the roster and the programs; what each caller may do
 * with it, checked against the roster as it is now; and `Notifications`, where
 * the chat server alone hands over what to tell you. It must not know how a
 * caller linked in, or how a device is told anything.
 */
export { createActions } from "./actions.ts";
export { gatewayFacet } from "./facet.ts";
export { createView } from "./view.ts";
