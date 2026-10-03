import { createRemoteServiceBinding } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ByteTransportFactory,
  Client,
  createClientServiceTransport,
} from "@earendil-works/pi-client";
import { GATEWAY_SERVER_ID } from "./endpoint.ts";
import { Gateway, type Registration } from "./services.ts";

export interface GatewayConnection {
  /**
   * Announce a program. It stays registered while this connection is open, and
   * registering again replaces the earlier entry.
   */
  register(registration: Registration): Promise<void>;
  list(): Promise<Registration[]>;
  /**
   * Called once when the connection ends, whether the gateway went away or
   * `close` was called. Nothing reconnects by itself, so a program that wants
   * to stay registered connects and registers again.
   */
  onDisconnect(listener: (reason: Error | undefined) => void): void;
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

export async function connectGateway(options: {
  transportFactory: ByteTransportFactory;
}): Promise<GatewayConnection> {
  const serverId = GATEWAY_SERVER_ID;
  const client = await Client.connect({ serverId, transportFactory: options.transportFactory });
  const scope = createRemoteServiceBinding({
    services: [Gateway],
    transport: createClientServiceTransport(client, () => ({ serverId })),
    bound: true,
  });
  try {
    // ready() only waits for services already acquired, so acquire first.
    const gateway = scope.use(Gateway);
    await scope.ready(context);

    const disconnects: ((reason: Error | undefined) => void)[] = [];
    client.onConnectionStateChange(({ state, error }) => {
      if (state !== "disconnected") return;
      for (const listener of disconnects) listener(error);
    });

    return {
      register: (registration) => gateway.register(registration, context),
      list: () => gateway.list(context),
      onDisconnect(listener) {
        disconnects.push(listener);
      },
      async close() {
        await scope.dispose(context).catch(() => undefined);
        await client.dispose();
      },
    };
  } catch (error) {
    await client.dispose();
    throw error;
  }
}
