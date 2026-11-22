import { type Backoff, keepRunning } from "../retry/index.ts";
import type { Linked } from "./linked.ts";

export interface KeepLinkOptions {
  /**
   * Make a link and put it to use, such as by dialing, reading the answer to a
   * hello and connecting the link to a host. Throw when it can't be made or
   * its answer is turned down: the next try waits longer. Abort `signal` gives
   * up on it.
   */
  link(signal: AbortSignal): Promise<Linked>;
  /** Abort to stop: the socket is dropped at once, whatever the network is doing. */
  readonly signal: AbortSignal;
  /** Told why a link couldn't be made. */
  readonly onError?: (error: unknown) => void;
  readonly backoff?: Backoff;
}

/**
 * Keep a link: make one, wait for it to close, and make the next after a
 * pause, which grows while links can't be made and starts over once one was.
 * Resolves once `signal` aborts and the socket is gone.
 */
export function keepLink(options: KeepLinkOptions): Promise<void> {
  return keepRunning({
    signal: options.signal,
    ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
    ...(options.onError === undefined ? {} : { onError: options.onError }),
    async attempt(established, signal) {
      const linked = await options.link(signal);
      const drop = (): void => linked.drop();
      signal.addEventListener("abort", drop, { once: true });
      if (signal.aborted) drop();
      try {
        established();
        await linked.closed;
      } finally {
        signal.removeEventListener("abort", drop);
        linked.drop();
      }
    },
  });
}
