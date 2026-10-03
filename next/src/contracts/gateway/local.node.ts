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

/** Connect to the gateway on this machine. Fails with `GatewayNotRunningError` if none is running. */
export async function connectLocalGateway(): Promise<GatewayConnection> {
  const path = namedSocketPath(GATEWAY_SOCKET_NAME);
  try {
    return await connectGateway({ transportFactory: createUnixTransportFactory({ path }) });
  } catch (error) {
    if (isNotListening(error)) throw new GatewayNotRunningError({ cause: error });
    throw error;
  }
}
