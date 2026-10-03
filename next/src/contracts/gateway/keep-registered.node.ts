import { type Backoff, keepRunning } from "../../lib/retry/index.ts";
import type { GatewayConnection } from "./connect.ts";
import { connectLocalGateway, GatewayNotRunningError } from "./local.node.ts";
import type { Registration } from "./services.ts";

export interface KeepRegisteredOptions {
  /**
   * Told why an attempt failed, such as a refused registration or a server that
   * is not the gateway. It is not told that no gateway is running: that is the
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
 * Stay registered with this machine's gateway. A registration lasts as long as
 * the connection that made it, so this connects, registers and holds the
 * connection open, and when the gateway goes away it tries again, pausing
 * longer after each failure, and registers again once the gateway is back.
 * Starting never waits for the gateway.
 */
export function keepRegistered(
  registration: Registration,
  options: KeepRegisteredOptions = {},
): KeptRegistration {
  const stopping = new AbortController();
  const running = keepRunning({
    signal: stopping.signal,
    backoff: options.backoff,
    onError(error) {
      if (error instanceof GatewayNotRunningError) return;
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    },
    async attempt(established, signal) {
      const gateway = await connectLocalGateway();
      try {
        if (signal.aborted) return;
        await gateway.register(registration);
        established();
        await ended(gateway, signal);
      } finally {
        await gateway.close().catch(() => undefined);
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

/** Resolves when the connection ends, or the signal aborts. */
function ended(gateway: GatewayConnection, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      signal.removeEventListener("abort", finish);
      resolve();
    };
    gateway.onDisconnect(finish);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}
