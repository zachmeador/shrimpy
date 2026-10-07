import { formatAddress } from "./address.ts";
import { webSocketPath } from "./endpoint.ts";
import type { Transports } from "./reach.ts";
import type { Address } from "./services.ts";
import { webSocketTransport } from "./web-socket.ts";

/**
 * The ways to reach the gateway at `address` and the programs registered with
 * it, over its network entry: for an agent apart from the gateway, such as one
 * under another user or on another machine. The way to a program carries the
 * ticket the client was given for it. Aborting `signal` gives up on a gateway
 * that has not let the connection open.
 */
export function entryTransports(address: Address, signal?: AbortSignal): Transports {
  const url = (path: string): string => `ws://${formatAddress(address)}${path}`;
  return {
    gateway: webSocketTransport(url(webSocketPath("gateway")), signal),
    program: (target, ticket) => webSocketTransport(url(webSocketPath(target, ticket))),
  };
}
