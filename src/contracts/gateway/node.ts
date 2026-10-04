/**
 * The Node-only door of the gateway contract: reaching the gateway on this
 * machine over its Unix socket, and staying registered with it. Browser code
 * must not import this file.
 */
export { type KeepRegisteredOptions, keepRegistered, type KeptRegistration } from "./keep-registered.node.ts";
export { connectLocalGateway, GatewayNotRunningError } from "./local.node.ts";
