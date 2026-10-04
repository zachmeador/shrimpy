/**
 * The gateway program: one process per machine that keeps the roster of who is
 * on the network, the registry of programs that are running, and the tickets
 * that tell a program who a client is, and gives browsers a way in. It only
 * connects things: it never holds an agent's home, its work or a conversation.
 * Other programs reach it through `contracts/gateway`; they never import this
 * program's modules. It must not know what the programs it connects say to
 * each other.
 */
import { userInfo } from "node:os";
import { GATEWAY_SOCKET_NAME } from "../contracts/gateway/index.ts";
import { namedSocketPath } from "../lib/runtime/node.ts";
import { takeGatewayLock } from "./lock.ts";
import { createRegistry } from "./registry/index.ts";
import { openRoster } from "./roster/index.ts";
import { startServer } from "./server.ts";
import { createTickets } from "./tickets/index.ts";
import { startWeb, type WebOptions } from "./web/index.ts";

export { GatewayRunningError } from "./lock.ts";
export { RosterOwnedError } from "./roster/index.ts";
export type { WebOptions } from "./web/index.ts";

export interface GatewayOptions {
  /** Where the gateway keeps the roster. It is made if it is missing. */
  dataDir: string;
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
 * asked. Fails if a gateway is already serving the socket or using the data
 * directory. The socket comes first, so a refused gateway touches neither the
 * data directory nor a port. The person who runs the gateway joins the roster
 * as it starts, so no agent can take their name before they are first seen.
 */
export async function startGateway(options: GatewayOptions): Promise<RunningGateway> {
  const socket = namedSocketPath(GATEWAY_SOCKET_NAME);
  const lock = takeGatewayLock(socket);
  const open: (() => void | Promise<void>)[] = [() => lock.release()];
  const closeAll = async (): Promise<void> => {
    const errors: unknown[] = [];
    for (const close of open.splice(0).reverse()) {
      try {
        await close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "The gateway did not close cleanly");
  };

  try {
    const osUser = userInfo().username;
    const roster = openRoster(options.dataDir);
    open.push(() => roster.close());
    roster.ensurePerson(osUser);
    const registry = createRegistry();
    const server = await startServer({ roster, registry, tickets: createTickets(), osUser }, socket);
    open.push(() => server.close());
    const web =
      options.web === undefined
        ? undefined
        : await startWeb(options.web, (target) =>
            target === "gateway" ? server.listingSocket : registry.find(target.kind, target.name)?.socket,
          );
    if (web !== undefined) open.push(() => web.close());
    return { socket, webPort: web?.port, close: closeAll };
  } catch (error) {
    await closeAll().catch(() => undefined);
    throw error;
  }
}
