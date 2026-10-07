import type { ByteTransportFactory } from "@earendil-works/pi-client";
import { isNotListening } from "../../lib/connection/index.ts";
import { type Backoff, keepRunning } from "../../lib/retry/index.ts";
import { connectGateway, type GatewayConnection } from "./connect.ts";
import { localTransports } from "./local.node.ts";
import type { Announcement } from "./services.ts";

/** How long after the connection opens, and after each answer, a program that checks on its gateway asks it something again. */
const ASK_EVERY_MS = 15_000;
/** How long an answer may take before such a program takes the connection for lost. */
const ANSWER_WITHIN_MS = 15_000;
/** How long such a program gives one try at connecting, signing in and registering. */
const TRY_WITHIN_MS = 15_000;

/** How a program checks that its gateway answers, which a gateway that went quiet with its connection still open would not tell it. */
export interface Heartbeat {
  /** How long after the connection opens, and after each answer, the gateway is asked again, in milliseconds. A quarter of a minute if not given. */
  everyMs?: number;
  /** How long an answer may take before the connection is taken for lost, in milliseconds. A quarter of a minute if not given. */
  withinMs?: number;
  /**
   * How long one try at connecting, signing in and registering may take before
   * it is given up and the next begins, in milliseconds. A gateway that takes the
   * connection and never answers would otherwise hold the program for as long as
   * the operating system lets it. A quarter of a minute if not given.
   */
  tryMs?: number;
}

export interface KeepRegisteredOptions {
  /**
   * How to reach the gateway. By default it is the gateway on this machine, over
   * its Unix socket; a gateway on another machine is reached over a transport to
   * it.
   */
  transportFactory?: ByteTransportFactory;
  /**
   * Run on each new connection before the program registers, to get a place on the
   * roster: an agent joins or signs in. A failure, a refusal included, ends
   * the attempt, is reported, and is tried again after a pause.
   */
  signIn?: (gateway: GatewayConnection) => Promise<void>;
  /**
   * Told why an attempt failed, such as a refused registration or a server that
   * is not the gateway. It is not told that nothing is listening: that is the
   * ordinary state of a machine whose gateway has not started yet.
   */
  onError?: (error: Error) => void;
  /**
   * Called each time the program has registered, on a new connection, which it
   * is given. A caller that tells of an attempt's failure once, and not again
   * while it repeats, starts over from here.
   */
  onRegistered?: (gateway: GatewayConnection) => void;
  /**
   * Called each time a connection the program was registered on is lost: it
   * ended, or the gateway stopped answering, and the program had not stopped. A
   * connection that never registered is not told of here, for its failure goes
   * to `onError`.
   */
  onLost?: () => void;
  /**
   * Ask the gateway something small every so often over the connection, and
   * take the connection for lost when no answer comes in time: let go of it and
   * connect again, as when it closes. A try that has not got as far as being
   * registered when its time is up is given up the same way. A gateway on
   * another machine can stop answering with its connection still open, which
   * one on this machine, over a Unix socket, can't. Giving it, even as `{}`,
   * turns it on.
   */
  heartbeat?: Heartbeat;
  /** The pauses between attempts. Tests shorten them. */
  backoff?: Backoff;
}

export interface KeptRegistration {
  /**
   * The connection, while it is up and the program is registered on it. It is
   * the connection to ask the gateway for tickets and for the roster over, as
   * whoever the program signed in as. It ends when the gateway goes away.
   */
  current(): GatewayConnection | undefined;
  /** The connection once it is up and registered: now, or as soon as it is. Rejects if `signal` aborts first. */
  untilUp(signal: AbortSignal): Promise<GatewayConnection>;
  /** Leave the gateway and stop trying to reach it. Resolves once the connection is closed. */
  stop(): Promise<void>;
}

/**
 * Stay registered with the gateway. A registration lasts as long as the
 * connection that made it, so this connects, signs in if the program has a
 * place on the roster, registers and holds the connection open, and when the
 * gateway goes away it tries again, pausing longer after each failure, and
 * registers again once the gateway is back. Starting never waits for the
 * gateway, and neither does stopping: a gateway that accepted the connection
 * and then stopped answering cannot hold either up, because stopping hangs up
 * whatever the attempt is waiting for. A gateway that stops answering with its
 * connection still open is noticed only when `heartbeat` is given.
 */
export function keepRegistered(
  announcement: Announcement,
  options: KeepRegisteredOptions = {},
): KeptRegistration {
  const transportFactory = options.transportFactory ?? localTransports().gateway;
  const stopping = new AbortController();
  let live: GatewayConnection | undefined;
  const waiting = new Set<(gateway: GatewayConnection) => void>();
  const running = keepRunning({
    signal: stopping.signal,
    backoff: options.backoff,
    onError(error) {
      if (isNotListening(error)) return;
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    },
    async attempt(established, signal) {
      const stopped = (): boolean => signal.aborted;
      const breakable = failable(transportFactory);
      const { heartbeat } = options;
      const quiet = (): void => breakable.fail("The gateway did not answer in time.");
      // A try gets only so long to be registered, from the moment it begins to connect.
      const giveUp = heartbeat === undefined ? undefined : setTimeout(quiet, heartbeat.tryMs ?? TRY_WITHIN_MS);
      let gateway: GatewayConnection | undefined;
      let stopAsking: (() => void) | undefined;
      // Whatever waits on the connection hears that it is gone, as it does when the gateway goes away, and
      // not that it was disposed of: a program that stops is no failure to anything that was asking.
      const hangUp = (): void => {
        breakable.fail("The program is stopping.");
        void gateway?.close();
      };
      try {
        gateway = await connectGateway({ transportFactory: breakable.transportFactory, signal });
        signal.addEventListener("abort", hangUp, { once: true });
        if (heartbeat !== undefined) stopAsking = keepAsking(gateway, heartbeat, quiet);
        if (signal.aborted) return;
        await options.signIn?.(gateway);
        await gateway.register(announcement);
        clearTimeout(giveUp);
        live = gateway;
        established();
        options.onRegistered?.(gateway);
        for (const wake of [...waiting]) wake(gateway);
        await ended(gateway);
        // Read through a function: stopping is what ended the connection, if it is. Nothing is lost then.
        if (!stopped()) options.onLost?.();
      } finally {
        clearTimeout(giveUp);
        stopAsking?.();
        live = undefined;
        signal.removeEventListener("abort", hangUp);
        await gateway?.close();
      }
    },
  });
  return {
    current: () => live,
    untilUp(signal) {
      if (live !== undefined) return Promise.resolve(live);
      return new Promise((resolve, reject) => {
        const arrived = (gateway: GatewayConnection): void => {
          cleanup();
          resolve(gateway);
        };
        const cancel = (): void => {
          cleanup();
          const reason: unknown = signal.reason;
          reject(reason instanceof Error ? reason : new DOMException("The wait was cancelled", "AbortError"));
        };
        function cleanup(): void {
          waiting.delete(arrived);
          signal.removeEventListener("abort", cancel);
        }
        if (signal.aborted) return cancel();
        waiting.add(arrived);
        signal.addEventListener("abort", cancel, { once: true });
      });
    },
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

/**
 * A transport that can be failed from outside, as if it had broken: what waits
 * on the connection hears that it is gone, as it does when the gateway goes
 * away, and not that this program hung up on it.
 */
function failable(transportFactory: ByteTransportFactory): {
  transportFactory: ByteTransportFactory;
  fail(reason: string): void;
} {
  let broken: ((error: Error) => void) | undefined;
  return {
    transportFactory: (handlers) => {
      broken = (error) => handlers.onError(error);
      return transportFactory(handlers);
    },
    fail: (reason) => broken?.(new Error(reason)),
  };
}

/**
 * Ask the gateway something small, first `everyMs` after this starts and then
 * after each answer, and call `lost` when an answer takes longer than
 * `withinMs`. Whatever the gateway says is an answer, a refusal included, since
 * it is there to refuse: only silence is not one. Returns what stops it.
 */
function keepAsking(
  gateway: GatewayConnection,
  { everyMs = ASK_EVERY_MS, withinMs = ANSWER_WITHIN_MS }: Heartbeat,
  lost: () => void,
): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const ask = async (): Promise<void> => {
    timer = setTimeout(lost, withinMs);
    try {
      await gateway.version();
    } catch {
      // A refusal is an answer, and a connection that ended is known already.
    }
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void ask(), everyMs);
  };
  timer = setTimeout(() => void ask(), everyMs);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
