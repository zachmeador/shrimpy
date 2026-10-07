import { rmSync } from "node:fs";
import {
  type RoutedServerServiceHost,
  Server,
  type ServerHost,
  SessionNotFoundError,
} from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import { Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME } from "../contracts/gateway/index.ts";
import { isClientGone, offerToConnection } from "../lib/offer/index.ts";
import { namedSocketPath } from "../lib/runtime/node.ts";
import { type GatewayDeps, type Peer, serveGateway } from "./connection.ts";

export interface GatewayServer {
  /** The Unix socket programs connect to. */
  readonly socket: string;
  /**
   * The socket the browser entry pipes to. A registration names a socket the
   * entry will then pipe to, so a page that could register could reach any
   * socket this user can. Connections here can list programs and the roster,
   * never register, sign in or ask for a ticket.
   */
  readonly listingSocket: string;
  /**
   * The socket the network entry pipes `/ws/gateway` to. A connection here is
   * apart from the gateway: it is never the person who runs it, and it can do
   * nothing until it has signed in or joined.
   */
  readonly apartSocket: string;
  close(): Promise<void>;
}

/**
 * Serve the gateway contract on `socket`, and on the listing socket and the
 * socket for connections from apart beside it. The caller holds the gateway's
 * lock, so a socket left at any of the paths is stale.
 */
export async function startServer(deps: GatewayDeps, socket: string): Promise<GatewayServer> {
  const listingSocket = namedSocketPath(`${GATEWAY_SOCKET_NAME}-listing`);
  const apartSocket = namedSocketPath(`${GATEWAY_SOCKET_NAME}-apart`);
  const servers: Server[] = [];
  const close = async (): Promise<void> => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  };
  try {
    servers.push(await serve(socket, serverHost(deps, "program")));
    servers.push(await serve(listingSocket, serverHost(deps, "browser")));
    servers.push(await serve(apartSocket, serverHost(deps, "apart")));
    return { socket, listingSocket, apartSocket, close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function serve(path: string, host: ServerHost): Promise<Server> {
  rmSync(path, { force: true });
  const server = new Server(host, {
    serverId: GATEWAY_SERVER_ID,
    listeners: [createUnixListener({ path })],
    onError(error) {
      if (!isClientGone(error)) console.error("[gateway]", error.message);
    },
  });
  await server.start();
  return server;
}

function serverHost(deps: GatewayDeps, peer: Peer): ServerHost {
  const serverServices: RoutedServerServiceHost = {
    attachClient() {
      const served = serveGateway(deps, peer);
      return offerToConnection(Gateway, served.gateway, () => served.end());
    },
  };
  return {
    serverServices,
    resolveSession: (sessionId) =>
      Promise.reject(new SessionNotFoundError(`The gateway has no sessions: ${sessionId}`)),
    openSession: () => Promise.reject(new Error("The gateway has no sessions")),
  };
}
