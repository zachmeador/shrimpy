/**
 * Who may do what at the agent. Every connection to the agent has a caller:
 * the home's owner when it came by the home's path, who may do anything, or
 * the member the gateway said it is when it came through the gateway, who may
 * if they are a person, an admin or the agent itself. Every operation of the
 * agent's API checks the caller before it acts, and this is the one place that
 * decides. It must not know how a connection is made or a ticket is redeemed.
 */
export { type Asker, carryCallers, type Caller, check, guardSession, type Permission, withCaller } from "./access.ts";
