/**
 * The gateway program: one process per machine that keeps the roster of who is
 * on the network, the registry of programs that are running, the tickets that
 * tell a program who a client is, the invitations that let an agent in from
 * apart, and a way in to each registered program, and gives browsers and
 * agents apart from it a way in too. A program is reached by its name through
 * the gateway, which pipes the connection to the program's socket and does not
 * look at it. It keeps the addresses it listens on for agents apart from it, so
 * that a start with none listens where the last one did. It only connects
 * things: it never holds an agent's home, its work or a conversation. Other
 * programs reach it through `contracts/gateway`; they never import this
 * program's modules. It must not know what the programs it connects say to each
 * other.
 */
import { userInfo } from "node:os";
import { type Address, GATEWAY_SOCKET_NAME } from "../contracts/gateway/index.ts";
import { wayInSocket } from "../contracts/gateway/node.ts";
import { namedSocketPath } from "../lib/runtime/node.ts";
import { type Entry, startEntry } from "./entry/index.ts";
import { createInvitations } from "./invitations/index.ts";
import { checkListenAddresses, keep, listeningFile, readKept } from "./listening/index.ts";
import { takeGatewayLock } from "./lock.ts";
import { createRegistry } from "./registry/index.ts";
import { openRoster } from "./roster/index.ts";
import { startServer } from "./server.ts";
import { createTickets } from "./tickets/index.ts";
import { startWeb, type WebOptions } from "./web/index.ts";
import { createWays } from "./ways/index.ts";

export { checkListenAddresses, readKept as keptListenAddresses } from "./listening/index.ts";
export { GatewayRunningError } from "./lock.ts";
export { RosterOwnedError } from "./roster/index.ts";
export type { WebOptions } from "./web/index.ts";

export interface GatewayOptions {
  /** Where the gateway keeps the roster. It is made if it is missing. */
  dataDir: string;
  /** Open the browser entry on loopback. Without it the gateway listens only on its Unix sockets. */
  web?: WebOptions;
  /**
   * The addresses to open the network entry on, for agents apart from the
   * gateway: under another user, in a container or on another machine. A port
   * of 0 picks one. Given, they replace the addresses the gateway kept in its
   * data directory, once it is listening on them. Without any, it listens where
   * it did at its last start, if it kept addresses there, and otherwise only on
   * its Unix sockets, and makes no invitations, since nobody could use one. An
   * address that means every interface is refused, since an invitation needs
   * one that another machine can use.
   */
  listen?: Address[];
}

export interface RunningGateway {
  /** The Unix socket programs connect to. */
  readonly socket: string;
  /** The port of the browser entry, when it is open. */
  readonly webPort: number | undefined;
  /** The addresses the network entry listens on, each with the port it got. None when it is not open. */
  readonly listening: Address[];
  /** The file the addresses were read from, when this start was given none and listens where an earlier one did. */
  readonly listeningAsKept: string | undefined;
  close(): Promise<void>;
}

/**
 * Start serving this machine's gateway socket, and the browser entry and the
 * network entry if asked. Fails if a gateway is already serving the socket or
 * using the data directory. The socket comes first, so a refused gateway
 * touches neither the data directory nor a port. The person who runs the
 * gateway joins the roster as it starts, so no agent can take their name before
 * they are first seen. An address that can't be listened on stops the start.
 */
export async function startGateway(options: GatewayOptions): Promise<RunningGateway> {
  // The longest path this gateway makes, so that a runtime directory too long for it is refused before anything is made.
  wayInSocket({ kind: "agent", name: "" });
  const given = options.listen === undefined || options.listen.length === 0 ? undefined : options.listen;
  if (given !== undefined) checkListenAddresses(given);
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
  const onError = (error: Error): void => console.error("[gateway]", error.message);

  try {
    const osUser = userInfo().username;
    const roster = openRoster(options.dataDir);
    open.push(() => roster.close());
    roster.ensurePerson(osUser);
    // What was kept is read once the data directory is held, so that no other gateway is changing it, and before anything listens.
    const kept = given === undefined ? readKept(options.dataDir) : [];
    const wanted = given ?? (kept.length > 0 ? kept : undefined);
    const listeningAsKept = given === undefined && kept.length > 0 ? listeningFile(options.dataDir) : undefined;
    const registry = createRegistry({ nameOf: (memberId) => roster.member(memberId)?.name });
    const ways = createWays({
      names: () => registry.names(),
      resolve: (target) => registry.find(target.kind, target.name)?.socket,
      onError,
    });
    open.push(() => ways.close());
    const tickets = createTickets();
    // The invitations ask for the addresses the entry got, which are known once it has listened.
    let entry: Entry | undefined;
    const server = await startServer(
      {
        roster,
        registry,
        tickets,
        invitations: createInvitations(),
        ways,
        osUser,
        addresses: () => entry?.addresses ?? [],
        onError,
      },
      socket,
    );
    open.push(() => server.close());
    const web =
      options.web === undefined
        ? undefined
        : await startWeb(options.web, (target) =>
            target === "gateway" ? server.listingSocket : registry.find(target.kind, target.name)?.socket,
          );
    if (web !== undefined) open.push(() => web.close());
    if (wanted !== undefined) {
      try {
        // A file edited by hand may name an address that is refused.
        checkListenAddresses(wanted);
        entry = await startEntry({
          addresses: wanted,
          gatewaySocket: server.apartSocket,
          good: (ticket, target) => tickets.check(ticket, target),
          resolve: (target) => registry.find(target.kind, target.name)?.socket,
        });
      } catch (error) {
        if (listeningAsKept === undefined) throw error;
        throw new Error(
          `${(error as Error).message} The gateway took the address from ${listeningAsKept}, where it kept what it listened on last time. ` +
            "Start it with other addresses to replace what is kept, or delete that file to listen on none.",
          { cause: error },
        );
      }
      open.push(() => entry?.close());
      // Only addresses that were listened on replace what was kept.
      if (given !== undefined) keep(options.dataDir, entry.addresses);
    }
    return { socket, webPort: web?.port, listening: entry?.addresses ?? [], listeningAsKept, close: closeAll };
  } catch (error) {
    await closeAll().catch(() => undefined);
    throw error;
  }
}
