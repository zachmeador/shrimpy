import { type Backoff, backoff } from "./backoff.ts";

export interface KeepRunningOptions {
  /**
   * One attempt at holding something open, such as a connection. It settles
   * when that ends, however it ends, and calls `established` once it is up.
   * It gets the stop signal, so it can end early.
   */
  attempt(established: () => void, signal: AbortSignal): Promise<void>;
  /** Abort to stop. */
  signal: AbortSignal;
  backoff?: Backoff;
  /** Told why an attempt ended, when it ended with an error before the stop. */
  onError?: (error: unknown) => void;
}

/**
 * Run `attempt` again each time it ends, pausing longer after each failure
 * and starting over from the shortest pause once an attempt was established.
 * Resolves after the signal aborts and the running attempt has settled.
 */
export async function keepRunning(options: KeepRunningOptions): Promise<void> {
  const { signal } = options;
  const pauses = options.backoff ?? backoff();
  const stopped = (): boolean => signal.aborted;
  while (!stopped()) {
    try {
      await options.attempt(() => pauses.reset(), signal);
    } catch (error) {
      if (!stopped()) options.onError?.(error);
    }
    if (!stopped()) await pause(pauses.next(), signal);
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}
