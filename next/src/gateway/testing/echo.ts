import { randomUUID } from "node:crypto";
import {
  type Context,
  createRemoteServiceBinding,
  createRemoteServiceEndpoint,
  defineService,
  RemoteServiceProvider,
} from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ByteTransportFactory,
  Client,
  createClientServiceTransport,
} from "@earendil-works/pi-client";
import { type RoutedServerServiceHost, Server, SessionNotFoundError } from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import { namedSocketPath } from "../../lib/runtime/index.ts";

interface Echo {
  echo(text: string, context: Context): Promise<string>;
}
const Echo = defineService<Echo>("shrimpy.gateway.testing.echo");

export interface EchoProgram {
  readonly serverId: string;
  /** Absolute path of its Unix socket. */
  readonly socket: string;
  /** How many connections are open right now. */
  connections(): number;
  close(): Promise<void>;
}

/**
 * The smallest pi-server there is: one service that answers with what it was
 * asked. It stands in for an agent behind the gateway's pipe, and it listens in
 * the runtime directory under `name`.
 */
export async function startEchoProgram(name: string): Promise<EchoProgram> {
  const serverId = randomUUID();
  const socket = namedSocketPath(name);
  let connections = 0;
  const serverServices: RoutedServerServiceHost = {
    attachClient() {
      const provider = new RemoteServiceProvider([{ service: Echo, mode: "singleton" }]);
      provider.provide(Echo, { echo: async (text) => `echo: ${text}` });
      const remote = createRemoteServiceEndpoint(provider);
      return {
        invokeService: (call, publish, context) => remote.invoke(call, publish, context),
        release() {
          remote.dispose();
          provider.dispose();
        },
      };
    },
  };
  const server = new Server(
    {
      serverServices,
      resolveSession: () => Promise.reject(new SessionNotFoundError()),
      openSession: () => Promise.reject(new Error("No sessions")),
    },
    {
      serverId,
      listeners: [createUnixListener({ path: socket })],
      onConnectionCountChanged: (count) => {
        connections = count;
      },
    },
  );
  await server.start();
  return { serverId, socket, connections: () => connections, close: () => server.close() };
}

export interface EchoClient {
  echo(text: string): Promise<string>;
  /** Called when the connection ends, from either side. */
  onDisconnect(listener: () => void): void;
  close(): Promise<void>;
}

/** Call an echo program over any transport: its Unix socket, or the gateway's WebSocket. */
export async function connectEcho(
  serverId: string,
  transportFactory: ByteTransportFactory,
): Promise<EchoClient> {
  const client = await Client.connect({ serverId, transportFactory });
  const scope = createRemoteServiceBinding({
    services: [Echo],
    transport: createClientServiceTransport(client, () => ({ serverId })),
    bound: true,
  });
  const echo = scope.use(Echo);
  await scope.ready(BACKGROUND_CONTEXT);
  return {
    echo: (text) => echo.echo(text, BACKGROUND_CONTEXT),
    onDisconnect(listener) {
      client.onConnectionStateChange(({ state }) => {
        if (state === "disconnected") listener();
      });
    },
    async close() {
      await scope.dispose(BACKGROUND_CONTEXT).catch(() => undefined);
      await client.dispose();
    },
  };
}
