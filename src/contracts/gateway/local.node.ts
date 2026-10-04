import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { isNotListening } from "../../lib/connection/index.ts";
import { namedSocketPath } from "../../lib/runtime/node.ts";
import { connectGateway, type GatewayConnection } from "./connect.ts";
import { GATEWAY_SOCKET_NAME } from "./endpoint.ts";
import type { Transports } from "./reach.ts";
import { wayInSocket } from "./way-in.node.ts";

/** Nothing is listening for the gateway on this machine. */
export class GatewayNotRunningError extends Error {
  constructor(options?: ErrorOptions) {
    super("No gateway is running on this machine.", options);
    this.name = "GatewayNotRunningError";
  }
}

/**
 * The ways to reach the gateway on this machine and the programs registered
 * with it: the gateway's own Unix socket, and for each program the socket the
 * gateway listens on for it.
 */
export function localTransports(): Transports {
  return {
    gateway: createUnixTransportFactory({ path: namedSocketPath(GATEWAY_SOCKET_NAME) }),
    program: (target) => createUnixTransportFactory({ path: wayInSocket(target) }),
  };
}

/**
 * Connect to the gateway on this machine. Fails with `GatewayNotRunningError` if
 * none is running. Aborting `signal` gives up on a gateway that is not answering.
 */
export async function connectLocalGateway(options: { signal?: AbortSignal } = {}): Promise<GatewayConnection> {
  try {
    return await connectGateway({ transportFactory: localTransports().gateway, signal: options.signal });
  } catch (error) {
    if (isNotListening(error)) throw new GatewayNotRunningError({ cause: error });
    throw error;
  }
}
