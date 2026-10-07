/**
 * The Node-only door of the gateway contract: reaching the gateway on this
 * machine, and programs through it, over Unix sockets, or the gateway at an
 * address, over its network entry, staying registered with the gateway, and
 * making an agent's token. Browser code must not import this file.
 */
export { entryTransports } from "./entry.node.ts";
export {
  type Heartbeat,
  type KeepRegisteredOptions,
  keepRegistered,
  type KeptRegistration,
} from "./keep-registered.node.ts";
export { connectLocalGateway, GatewayNotRunningError, localTransports } from "./local.node.ts";
export { newToken } from "./token.node.ts";
export { waysDirectory, wayInSocket } from "./way-in.node.ts";
