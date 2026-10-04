import type { ByteTransportFactory } from "@earendil-works/pi-client";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { isNotListening } from "../../lib/connection/index.ts";
import { namedSocketPath } from "../../lib/runtime/node.ts";
import { connectGateway, type GatewayConnection } from "./connect.ts";
import { GATEWAY_SOCKET_NAME } from "./endpoint.ts";

/** Nothing is listening for the gateway on this machine. */
export class GatewayNotRunningError extends Error {
  constructor(options?: ErrorOptions) {
    super("No gateway is running on this machine.", options);
    this.name = "GatewayNotRunningError";
  }
}

/** The way to reach the gateway on this machine: its Unix socket. */
export function localGatewayTransport(): ByteTransportFactory {
  return createUnixTransportFactory({ path: namedSocketPath(GATEWAY_SOCKET_NAME) });
}

/**
 * Connect to the gateway on this machine. Fails with `GatewayNotRunningError` if
 * none is running. Aborting `signal` gives up on a gateway that is not answering.
 */
export async function connectLocalGateway(options: { signal?: AbortSignal } = {}): Promise<GatewayConnection> {
  try {
    return await connectGateway({ transportFactory: localGatewayTransport(), signal: options.signal });
  } catch (error) {
    if (isNotListening(error)) throw new GatewayNotRunningError({ cause: error });
    throw error;
  }
}
