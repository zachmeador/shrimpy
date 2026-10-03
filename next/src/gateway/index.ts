/**
 * The gateway program: one process per machine that keeps the registry of
 * running programs and gives browsers a way in. It only connects things: it
 * never holds an agent's home, its work or a conversation. Other programs
 * reach it through `contracts/gateway`; they never import this program's
 * modules.
 */
import { createRegistry } from "./registry/index.ts";
import { startServer } from "./server.ts";
import { startWeb, type WebOptions } from "./web/index.ts";

export { GatewayRunningError } from "./lock.ts";
export type { WebOptions } from "./web/index.ts";

export interface GatewayOptions {
  /** Open the browser entry on loopback. Without it the gateway listens only on its Unix socket. */
  web?: WebOptions;
}

export interface RunningGateway {
  /** The Unix socket programs connect to. */
  readonly socket: string;
  /** The port of the browser entry, when it is open. */
  readonly webPort: number | undefined;
  close(): Promise<void>;
}

/**
 * Start serving this machine's gateway socket, and the browser entry if
 * asked. Fails if a gateway is already serving the socket. The socket comes
 * first, so a refused gateway never opens a port.
 */
export async function startGateway(options: GatewayOptions = {}): Promise<RunningGateway> {
  const registry = createRegistry();
  const server = await startServer(registry);
  try {
    const web =
      options.web === undefined
        ? undefined
        : await startWeb(options.web, (target) =>
            target === "gateway"
              ? server.listingSocket
              : registry.find(target.kind, target.name)?.socket,
          );
    return {
      socket: server.socket,
      webPort: web?.port,
      async close() {
        try {
          await web?.close();
        } finally {
          await server.close();
        }
      },
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}
