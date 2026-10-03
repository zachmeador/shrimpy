/**
 * The Node-only door of the gateway contract: reaching the gateway on this
 * machine over its Unix socket. Browser code must not import this file.
 */
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { namedSocketPath } from "../../lib/runtime/node.ts";
import { connectGateway, type GatewayConnection } from "./connect.ts";
import { GATEWAY_SOCKET_NAME } from "./endpoint.ts";

/** Connect to the gateway on this machine. Fails if none is running. */
export function connectLocalGateway(): Promise<GatewayConnection> {
  const path = namedSocketPath(GATEWAY_SOCKET_NAME);
  return connectGateway({ transportFactory: createUnixTransportFactory({ path }) });
}
