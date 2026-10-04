import { createRemoteServiceBinding, type RemoteServiceBinding, type Service } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import {
  type ByteTransportFactory,
  Client,
  createClientServiceTransport,
} from "@earendil-works/pi-client";
import { politely } from "./goodbye.ts";

const context = BACKGROUND_CONTEXT;

export interface ConnectionOptions<S> {
  serverId: string;
  transportFactory: ByteTransportFactory;
  /** The service every connection to the program has. */
  service: Service<S>;
  /**
   * Abort to give up while connecting, even on a server that accepted the
   * connection and then stopped answering: the half-made connection is dropped
   * and connecting fails with the signal's reason. Once the connection is made
   * the signal does nothing.
   */
  signal?: AbortSignal;
}

export interface Connection<S> {
  /** The program's service, bound for as long as the connection lasts. */
  readonly service: S;
  /** Called each time the connection ends, with why when that is known. */
  onDisconnect(listener: (reason: Error | undefined) => void): void;
  /**
   * Disconnect. Saying goodbye first is a courtesy that gets a moment: a server
   * that has stopped answering cannot hold the connection open. With
   * `goodbye: false` the server is not told at all, which is what to do while a
   * call is still waiting for its answer: saying goodbye would wait behind it,
   * and the server lets go of what a dropped connection held.
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
  const { serverId, signal } = options;
  signal?.throwIfAborted();
  const client = new Client({ serverId, transportFactory: options.transportFactory });
  // Disposing the client ends a connect that is waiting for the server, and drops its socket.
  const giveUp = (): void => void client.dispose();
  signal?.addEventListener("abort", giveUp, { once: true });
  try {
    await client.connect();
    const scope = createRemoteServiceBinding({
      services: [options.service],
      transport: createClientServiceTransport(client, () => ({ serverId })),
      bound: true,
    });
    // ready() only waits for services already acquired, so acquire first.
    const service = scope.use(options.service);
    await scope.ready(signal === undefined ? context : withAbortSignal(signal, context));
    return { client, connection: assemble(client, scope, service) };
  } catch (error) {
    await client.dispose();
    throw signal?.aborted === true ? abortReason(signal) : error;
  } finally {
    signal?.removeEventListener("abort", giveUp);
  }
}

function assemble<S>(client: Client, scope: RemoteServiceBinding, service: S): Connection<S> {
  const disconnects: ((reason: Error | undefined) => void)[] = [];
  client.onConnectionStateChange(({ state, error }) => {
    if (state !== "disconnected") return;
    for (const listener of disconnects) listener(error);
  });
  return {
    service,
    onDisconnect(listener) {
      disconnects.push(listener);
    },
    async close({ goodbye = true } = {}) {
      if (goodbye) await politely(scope.dispose(context));
      await client.dispose();
    },
  };
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException("Connecting was abandoned", "AbortError");
}
