import { createListeners } from "../../../lib/listeners/index.ts";
import { type Backoff, keepRunning } from "../../../lib/retry/index.ts";
import { CONNECTING, Down, type LinkStatus, type Why } from "./status.ts";

/** What a connection to a program has to offer for it to be kept. */
export interface Connected {
  onDisconnect(listener: (reason: Error | undefined) => void): void;
  close(): Promise<void>;
}

export interface KeepOptions<C extends Connected> {
  /**
   * Reach the program and get the connection ready to use. While it waits for
   * the program to be there, `waiting` says why. It throws `Down` for a reason
   * a person can be given; any other failure is reported as the program being
   * unreachable.
   */
  open(signal: AbortSignal, waiting: (why: Why) => void): Promise<C>;
  /** Runs for each connection that comes up. It returns what to run when that connection ends. */
  onUp?(connection: C): () => void;
  /** The pauses between attempts. Tests shorten them. */
  backoff?: Backoff;
}

export interface Keeper<C> {
  /** The connection, while there is one. */
  current(): C | undefined;
  status(): LinkStatus;
  /** Tell `listener` each time the status changes. Returns what stops that. */
  onStatus(listener: (status: LinkStatus) => void): () => void;
  /** Hang up and stop trying. Resolves once the connection is closed. */
  close(): Promise<void>;
}

/**
 * Keep a connection to a program for as long as the keeper is open: open it,
 * hold it, and when it is lost try again, pausing longer after each failure. It
 * never gives up, and it never holds up whoever uses it: `current` is a
 * connection or nothing, and the status says which and why.
 */
export function keepConnection<C extends Connected>(options: KeepOptions<C>): Keeper<C> {
  const stopping = new AbortController();
  const changes = createListeners<LinkStatus>(() => undefined);
  let status: LinkStatus = CONNECTING;
  let current: C | undefined;

  const set = (next: LinkStatus): void => {
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    changes.notify(next);
  };

  const running = keepRunning({
    signal: stopping.signal,
    backoff: options.backoff,
    onError(error) {
      const why: Why =
        error instanceof Down
          ? error.why
          : { kind: "unreachable", message: error instanceof Error ? error.message : String(error) };
      set({ state: "down", why });
    },
    async attempt(established, signal) {
      const connection = await options.open(signal, (why) => set({ state: "down", why }));
      const ended = new Promise<void>((resolve) => connection.onDisconnect(() => resolve()));
      // Stopping ends a connection that is up.
      const hangUp = (): void => void connection.close().catch(() => undefined);
      signal.addEventListener("abort", hangUp, { once: true });
      let letGo: (() => void) | undefined;
      try {
        current = connection;
        set({ state: "up" });
        established();
        letGo = options.onUp?.(connection);
        await ended;
      } finally {
        signal.removeEventListener("abort", hangUp);
        letGo?.();
        current = undefined;
        if (!signal.aborted) set({ state: "down", why: { kind: "lost" } });
        await connection.close().catch(() => undefined);
      }
    },
  });

  return {
    current: () => current,
    status: () => status,
    onStatus: (listener) => changes.add(listener),
    async close() {
      stopping.abort();
      changes.clear();
      await running;
    },
  };
}
