import { rmSync } from "node:fs";
import {
  createRemoteServiceEndpoint,
  RemoteServiceError,
  RemoteServiceProvider,
} from "@earendil-works/chord";
import {
  type RoutedServerServiceHost,
  Server,
  type ServerHost,
  SessionNotFoundError,
} from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import { Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME } from "../contracts/gateway/index.ts";
import { namedSocketPath } from "../lib/runtime/index.ts";
import { takeGatewayLock } from "./lock.ts";
import { InvalidRegistrationError, type Registry } from "./registry/index.ts";

export interface GatewayServer {
  /** The Unix socket programs connect to. */
  readonly socket: string;
  close(): Promise<void>;
}

/** Serve the gateway contract for `registry` on this machine's gateway socket. The lock comes first. */
export async function startServer(registry: Registry): Promise<GatewayServer> {
  const socket = namedSocketPath(GATEWAY_SOCKET_NAME);
  const lock = takeGatewayLock(socket);
  try {
    // This process holds the lock, so a socket left at its path is stale.
    rmSync(socket, { force: true });
    const server = new Server(serverHost(registry), {
      serverId: GATEWAY_SERVER_ID,
      listeners: [createUnixListener({ path: socket })],
      onError: (error) => console.error("[gateway]", error.message),
    });
    await server.start();
    return {
      socket,
      async close() {
        await server.close();
        lock.release();
      },
    };
  } catch (error) {
    lock.release();
    throw error;
  }
}

/** Each connection gets its own slot in the registry, which closes with the connection. */
function serverHost(registry: Registry): ServerHost {
  const serverServices: RoutedServerServiceHost = {
    attachClient() {
      const connection = registry.connect();
      const provider = new RemoteServiceProvider([{ service: Gateway, mode: "singleton" }]);
      provider.provide(Gateway, {
        register: async (registration) => {
          try {
            connection.register(registration);
          } catch (error) {
            // Only errors with a protocol code reach the peer with their message.
            if (error instanceof InvalidRegistrationError) {
              throw new RemoteServiceError("service_invalid_value", error.message);
            }
            throw error;
          }
        },
        list: async () => registry.list(),
      });
      const remote = createRemoteServiceEndpoint(provider);
      return {
        invokeService: (call, publish, callContext) => remote.invoke(call, publish, callContext),
        release() {
          connection.close();
          remote.dispose();
          provider.dispose();
        },
      };
    },
  };
  return {
    serverServices,
    resolveSession: (sessionId) =>
      Promise.reject(new SessionNotFoundError(`The gateway has no sessions: ${sessionId}`)),
    openSession: () => Promise.reject(new Error("The gateway has no sessions")),
  };
}
