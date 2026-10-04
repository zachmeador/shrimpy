import type { ByteTransportFactory } from "@earendil-works/pi-client";
import { isNotListening } from "../../lib/connection/index.ts";
import { type Backoff, keepRunning } from "../../lib/retry/index.ts";
import { connectGateway, type GatewayConnection } from "./connect.ts";
import { localGatewayTransport } from "./local.node.ts";
import type { Registration } from "./services.ts";

export interface KeepRegisteredOptions {
  /**
   * How to reach the gateway. By default it is the gateway on this machine, over
   * its Unix socket; a gateway on another machine is reached over a transport to
   * it.
   */
  transportFactory?: ByteTransportFactory;
  /**
   * Told why an attempt failed, such as a refused registration or a server that
   * is not the gateway. It is not told that nothing is listening: that is the
   * ordinary state of a machine whose gateway has not started yet.
   */
  onError?: (error: Error) => void;
  /** The pauses between attempts. Tests shorten them. */
  backoff?: Backoff;
}

export interface KeptRegistration {
  /** Leave the gateway and stop trying to reach it. Resolves once the connection is closed. */
  stop(): Promise<void>;
}

/**
 * Stay registered with the gateway. A registration lasts as long as the
 * connection that made it, so this connects, registers and holds the
 * connection open, and when the gateway goes away it tries again, pausing
 * longer after each failure, and registers again once the gateway is back.
 * Starting never waits for the gateway, and neither does stopping: a gateway
 * that accepted the connection and then stopped answering cannot hold either
 * up, because stopping hangs up whatever the attempt is waiting for.
 */
export function keepRegistered(
  registration: Registration,
  options: KeepRegisteredOptions = {},
): KeptRegistration {
  const transportFactory = options.transportFactory ?? localGatewayTransport();
  const stopping = new AbortController();
  const running = keepRunning({
    signal: stopping.signal,
    backoff: options.backoff,
    onError(error) {
      if (isNotListening(error)) return;
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    },
    async attempt(established, signal) {
      const gateway = await connectGateway({ transportFactory, signal });
      // Ending the connection ends a register that is waiting for its answer too.
      const hangUp = (): void => void gateway.close();
      signal.addEventListener("abort", hangUp, { once: true });
      try {
        if (signal.aborted) return;
        await gateway.register(registration);
        established();
        await ended(gateway);
      } finally {
        signal.removeEventListener("abort", hangUp);
        await gateway.close();
      }
    },
  });
  return {
    async stop() {
      stopping.abort();
      await running;
    },
  };
}

/** Resolves when the connection ends, which stopping also does. */
function ended(gateway: GatewayConnection): Promise<void> {
  return new Promise((resolve) => gateway.onDisconnect(() => resolve()));
}
