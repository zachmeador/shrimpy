/**
 * The Node-only door of the agent contract: linking straight to the agent of a
 * home by the home's path, on its own socket, and reading and keeping the
 * membership the home holds. Browser code must not import this file.
 */
export { AgentNotRunningError, connectHome, type ConnectHomeOptions, type HomeClient, readEndpoint } from "./connect.node.ts";
export { readMembership, saveMembership } from "./membership.node.ts";
