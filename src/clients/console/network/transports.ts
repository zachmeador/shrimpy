import type { ByteTransportFactory } from "@earendil-works/pi-client";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { GATEWAY_SOCKET_NAME, type Registration } from "../../../contracts/gateway/index.ts";
import { namedSocketPath } from "../../../lib/runtime/node.ts";

/**
 * How the console reaches the programs it talks to. Each link is handed a
 * transport instead of knowing where a program is, so the same console can
 * reach a gateway on another machine, and the programs it lists.
 */
export interface Transports {
  /** To the gateway. */
  gateway: ByteTransportFactory;
  /** To a program the gateway lists. */
  program(registration: Registration): ByteTransportFactory;
}

/** The default: the gateway on this machine, and the programs it lists, each over its Unix socket. */
export function localTransports(): Transports {
  return {
    gateway: createUnixTransportFactory({ path: namedSocketPath(GATEWAY_SOCKET_NAME) }),
    program: (registration) => createUnixTransportFactory({ path: registration.socket }),
  };
}
