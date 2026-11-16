/**
 * Who may do what at the agent. Every request has a caller, from who it is
 * stamped as and the roster as the agent holds it now: the home's owner on the
 * home's own socket, who may do anything, or a member through the gateway, who
 * may if it is you, an admin or the agent itself. A name and whether a member is
 * an admin are read from the roster when they are needed, so a rename or a
 * promotion counts at once. Every operation of the agent's contract checks the
 * caller before it acts, and this is the one place that decides. It must not
 * know how a request arrives or how the roster is held.
 */
export { type Caller, callerOf, check, type Permission, refusalFor } from "./access.ts";
