import { rmSync } from "node:fs";
import {
  type RoutedServerServiceHost,
  Server,
  type ServerHost,
  SessionNotFoundError,
} from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import { Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME } from "../contracts/gateway/index.ts";
import { offerToConnection } from "../lib/offer/index.ts";
import { refuse } from "../lib/refusal/index.ts";
import { namedSocketPath } from "../lib/runtime/node.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { takeGatewayLock } from "./lock.ts";
import { InvalidRegistrationError, type Registry } from "./registry/index.ts";

export interface GatewayServer {
  /** The Unix socket programs connect to. */
  readonly socket: string;
  /**
   * The socket the browser entry pipes to. A registration names a socket the
   * entry will then pipe to, so a page that could register could reach any
   * socket this user can. Connections here can list programs, never register.
   */
  readonly listingSocket: string;
  close(): Promise<void>;
}

/** Who is on the other end: a program on this machine, or a page that came through the browser entry. */
type Peer = "program" | "browser";

/** Serve the gateway contract for `registry` on this machine's gateway sockets. The lock comes first. */
export async function startServer(registry: Registry): Promise<GatewayServer> {
  const socket = namedSocketPath(GATEWAY_SOCKET_NAME);
  const listingSocket = namedSocketPath(`${GATEWAY_SOCKET_NAME}-listing`);
  const lock = takeGatewayLock(socket);
  const servers: Server[] = [];
  const close = async (): Promise<void> => {
    try {
      await Promise.all(servers.splice(0).map((server) => server.close()));
    } finally {
      lock.release();
    }
  };
  try {
    servers.push(await serve(socket, serverHost(registry, "program")));
    servers.push(await serve(listingSocket, serverHost(registry, "browser")));
    return { socket, listingSocket, close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function serve(path: string, host: ServerHost): Promise<Server> {
  // This process holds the lock, so a socket left at this path is stale.
  rmSync(path, { force: true });
  const server = new Server(host, {
    serverId: GATEWAY_SERVER_ID,
    listeners: [createUnixListener({ path })],
    onError: (error) => console.error("[gateway]", error.message),
  });
  await server.start();
  return server;
}

/** A program's connection can hold one registration, which is dropped when the connection ends. */
function serverHost(registry: Registry, peer: Peer): ServerHost {
  const serverServices: RoutedServerServiceHost = {
    attachClient() {
      const connection = peer === "program" ? registry.connect() : undefined;
      return offerToConnection(
        Gateway,
        {
          register: async (registration) => {
            if (connection === undefined) {
              refuse(
                "Only a program on the gateway's machine can register. A browser can list what is running.",
                "service_not_allowed",
              );
            }
            try {
              connection.register(registration);
            } catch (error) {
              if (error instanceof InvalidRegistrationError) refuse(error.message);
              throw error;
            }
          },
          list: async () => registry.list(),
          version: async () => SHRIMPY_VERSION,
        },
        () => connection?.close(),
      );
    },
  };
  return {
    serverServices,
    resolveSession: (sessionId) =>
      Promise.reject(new SessionNotFoundError(`The gateway has no sessions: ${sessionId}`)),
    openSession: () => Promise.reject(new Error("The gateway has no sessions")),
  };
}
