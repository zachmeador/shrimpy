import { namedSocketPath } from "../../lib/runtime/node.ts";

/** What the gateway's own socket is called in the runtime directory. */
const GATEWAY_SOCKET_NAME = "gateway";

/**
 * The gateway's own socket on this machine. A connection on it that shows no
 * token is you: its directory opens only to the gateway's OS account, and one
 * that doesn't is refused here, for the gateway and for whoever dials it.
 */
export function gatewaySocket(): string {
  return namedSocketPath(GATEWAY_SOCKET_NAME);
}
