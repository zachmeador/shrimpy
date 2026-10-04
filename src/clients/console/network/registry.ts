import { setTimeout as delay } from "node:timers/promises";
import {
  connectGateway,
  type GatewayConnection,
  type ProgramName,
  type Registration,
  type RosterEntry,
} from "../../../contracts/gateway/index.ts";
import { isDisconnected, isNotListening } from "../../../lib/connection/index.ts";
import { createListeners } from "../../../lib/listeners/index.ts";
import { type Backoff, keepRunning } from "../../../lib/retry/index.ts";
import { CONNECTING, Down, type LinkStatus, type Why } from "./status.ts";
import type { Transports } from "./transports.ts";

/** What the gateway says is running and who is on its roster. */
export interface Listing {
  /** Every program it lists, oldest first. */
  programs: Registration[];
  /** Everyone on the roster, oldest first, whether they are running or not. */
  members: RosterEntry[];
  /** The version of Shrimpy the gateway runs. */
  version: string;
}

export interface RegistryOptions {
  transports: Transports;
  /** How often the gateway is asked what is running. It has nothing to tell the console when that changes. */
  pollMs: number;
  /** The pauses between attempts to reach the gateway. Tests shorten them. */
  backoff?: Backoff;
}

/** The console's way to the gateway: what is running, kept as current as the gateway can be asked for. */
export interface RegistryLink {
  /** What the gateway last said. It stays after the gateway is lost, as what was last known. */
  listing(): Listing | undefined;
  status(): LinkStatus;
  /** Tell `listener` each time the listing or the status changes. Returns what stops that. */
  onChange(listener: () => void): () => void;
  /**
   * The newest listed program that satisfies `match`, now or as soon as the
   * gateway lists one. While it waits, `waiting` is called. Rejects when
   * `signal` aborts.
   */
  untilListed(match: (program: Registration) => boolean, signal: AbortSignal, waiting?: () => void): Promise<Registration>;
  /**
   * A ticket from the gateway for `target`, to hand to it. The console never
   * signs in, so the gateway says the ticket is for the person who runs it. Fails
   * with `Down`, saying why, when the gateway is not being reached.
   */
  ticket(target: ProgramName): Promise<string>;
  /** Hang up and stop asking. */
  close(): Promise<void>;
}

/**
 * Keep a connection to the gateway and ask it what is running, again and again.
 * When the gateway goes away the last listing stays, and the connection is tried
 * again with pauses that grow, until the gateway is back.
 */
export function keepRegistry(options: RegistryOptions): RegistryLink {
  const stopping = new AbortController();
  const changes = createListeners<undefined>(() => undefined);
  let listing: Listing | undefined;
  let status: LinkStatus = CONNECTING;
  let live: GatewayConnection | undefined;

  const setStatus = (next: LinkStatus): void => {
    if (JSON.stringify(next) === JSON.stringify(status)) return;
    status = next;
    changes.notify(undefined);
  };
  const setListing = (next: Listing): void => {
    if (JSON.stringify(next) === JSON.stringify(listing)) return;
    listing = next;
    changes.notify(undefined);
  };

  const running = keepRunning({
    signal: stopping.signal,
    backoff: options.backoff,
    onError(error) {
      const why: Why = isNotListening(error)
        ? { kind: "not-running" }
        : isDisconnected(error)
          ? { kind: "lost" }
          : { kind: "unreachable", message: error instanceof Error ? error.message : String(error) };
      setStatus({ state: "down", why });
    },
    async attempt(established, signal) {
      const gateway = await connectGateway({ transportFactory: options.transports.gateway, signal });
      const lost = new AbortController();
      gateway.onDisconnect(() => lost.abort());
      const hangUp = (): void => void gateway.close().catch(() => undefined);
      signal.addEventListener("abort", hangUp, { once: true });
      try {
        const version = await gateway.version();
        established();
        setStatus({ state: "up" });
        live = gateway;
        const over = AbortSignal.any([signal, lost.signal]);
        while (!over.aborted) {
          setListing({ programs: await gateway.list(), members: await gateway.members(), version });
          await delay(options.pollMs, undefined, { signal: over }).catch(() => undefined);
        }
      } finally {
        live = undefined;
        signal.removeEventListener("abort", hangUp);
        if (!signal.aborted) setStatus({ state: "down", why: { kind: "lost" } });
        await gateway.close().catch(() => undefined);
      }
    },
  });

  return {
    listing: () => listing,
    status: () => status,
    onChange: (listener) => changes.add(() => listener()),
    untilListed(match, signal, waiting) {
      const found = (): Registration | undefined => listing?.programs.findLast(match);
      const now = found();
      if (now !== undefined) return Promise.resolve(now);
      waiting?.();
      return new Promise((resolve, reject) => {
        const stop = changes.add(() => {
          const next = found();
          if (next === undefined) return;
          cleanup();
          resolve(next);
        });
        const cancel = (): void => {
          cleanup();
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new DOMException("The wait was cancelled", "AbortError"));
        };
        function cleanup(): void {
          stop();
          signal.removeEventListener("abort", cancel);
        }
        if (signal.aborted) return cancel();
        signal.addEventListener("abort", cancel, { once: true });
      });
    },
    async ticket(target) {
      if (live === undefined) throw new Down(status.state === "down" ? status.why : { kind: "lost" });
      return live.ticket(target);
    },
    async close() {
      stopping.abort();
      changes.clear();
      await running;
    },
  };
}
