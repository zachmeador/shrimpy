import { createRemoteServiceBinding, type Service } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ByteTransportFactory,
  Client,
  createClientServiceTransport,
} from "@earendil-works/pi-client";

const context = BACKGROUND_CONTEXT;

export interface ConnectionOptions<S> {
  serverId: string;
  transportFactory: ByteTransportFactory;
  /** The service every connection to the program has. */
  service: Service<S>;
}

export interface Connection<S> {
  /** The program's service, bound for as long as the connection lasts. */
  readonly service: S;
  /** Called each time the connection ends, with why when that is known. */
  onDisconnect(listener: (reason: Error | undefined) => void): void;
  /**
   * Disconnect. With `goodbye: false` the server is not told first, which is
   * what to do while a call is still waiting for its answer: saying goodbye
   * would wait behind it, and the server lets go of what a dropped connection
   * held.
   */
  close(options?: { goodbye?: boolean }): Promise<void>;
}

/**
 * Connect to a program and bind its service. If the program does not offer
 * the service, this fails and the client is disposed.
 */
export async function openConnection<S>(options: ConnectionOptions<S>): Promise<Connection<S>> {
  return (await connect(options)).connection;
}

/** The connection with the client under it, for what is built on top of it. */
export async function connect<S>(
  options: ConnectionOptions<S>,
): Promise<{ client: Client; connection: Connection<S> }> {
  const { serverId } = options;
  const client = await Client.connect({ serverId, transportFactory: options.transportFactory });
  const scope = createRemoteServiceBinding({
    services: [options.service],
    transport: createClientServiceTransport(client, () => ({ serverId })),
    bound: true,
  });
  let service: S;
  try {
    // ready() only waits for services already acquired, so acquire first.
    service = scope.use(options.service);
    await scope.ready(context);
  } catch (error) {
    await client.dispose();
    throw error;
  }

  const disconnects: ((reason: Error | undefined) => void)[] = [];
  client.onConnectionStateChange(({ state, error }) => {
    if (state !== "disconnected") return;
    for (const listener of disconnects) listener(error);
  });

  return {
    client,
    connection: {
      service,
      onDisconnect(listener) {
        disconnects.push(listener);
      },
      async close({ goodbye = true } = {}) {
        if (goodbye) await scope.dispose(context).catch(() => undefined);
        await client.dispose();
      },
    },
  };
}
