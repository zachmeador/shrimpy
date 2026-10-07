import { randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";

/** How long a call is good for, from when it was made. */
export const CALL_MS = 15_000;

/**
 * Stands for the connection an agent apart from the gateway is registered on.
 * This module only tells one from another, and never looks at it.
 */
export type Answerer = object;

/** What takes the connection an agent opens to answer a call. */
export interface Answering {
  /** The agent's connection is open: hand it to whoever asked for the agent. One that arrives too late is closed. */
  arrive(connection: Duplex): void;
  /** The agent's connection did not open, so whoever asked is let go. */
  abandon(): void;
}

/**
 * The calls in flight: what the gateway makes when a client asks for an agent
 * that registered with no socket, since it can't dial one. A call is for one
 * agent, has an ID that nobody could guess, and is good once and for a short
 * time. Whoever asked waits for the agent to answer, by opening a connection
 * that carries the ID. They are kept in memory only, so a gateway that
 * restarts forgets them, and whoever waited is let go with it.
 */
export interface Calls {
  /**
   * Make a call for the agent behind `answerer`, and wait for it to be
   * answered. Resolves with the connection the agent answered with. Rejects when
   * the agent does not answer in time, when `answerer` ends, when `signal`
   * aborts because whoever asked has gone, or when the calls close.
   */
  make(answerer: Answerer, signal: AbortSignal): Promise<Duplex>;
  /**
   * The IDs of the calls for `answerer` that it has not been told of, oldest
   * first, waiting until there is one. Each is told once. Rejects when `signal`
   * aborts or `answerer` ends.
   */
  next(answerer: Answerer, signal?: AbortSignal): Promise<string[]>;
  /**
   * Take the call whose ID is `id` for answering: its ID is spent, so nobody can
   * take it again. Undefined when no call waits under it, because the ID was
   * never made, was used, ran out, or whoever asked has gone.
   */
  answer(id: string): Answering | undefined;
  /** `answerer` is gone: the calls waiting for it end, and so does an ask in progress. */
  end(answerer: Answerer): void;
  /** End every call and every ask. Nothing is made after this. */
  close(): void;
}

export interface CallsOptions {
  /** How long a call is good for, in milliseconds. Tests shorten it. */
  ttlMs?: number;
}

interface Call {
  readonly id: string;
  readonly answerer: Answerer;
  /** Whether the agent has been told of it. */
  told: boolean;
  /** Spend the ID: from now on no one else can take it. */
  take(): Answering;
  /** The call is over without an answer: whoever asked is told why. */
  end(reason: Error): void;
}

/** Someone asking for their calls, waiting for one. */
interface Ask {
  readonly answerer: Answerer;
  /** A call was made: take it if it is for the one asking. */
  wake(): void;
  stop(reason: Error): void;
}

export function createCalls(options: CallsOptions = {}): Calls {
  const ttl = options.ttlMs ?? CALL_MS;
  // Oldest first. A call is here from when it is made until it is taken, ends or runs out.
  const waiting = new Map<string, Call>();
  const asking = new Set<Ask>();
  let closed = false;

  /** The calls for `answerer` it has not been told of yet, now told. */
  const toldOf = (answerer: Answerer): string[] => {
    const ids: string[] = [];
    for (const call of waiting.values()) {
      if (call.answerer !== answerer || call.told) continue;
      call.told = true;
      ids.push(call.id);
    }
    return ids;
  };

  return {
    make(answerer, signal) {
      return new Promise<Duplex>((resolve, reject) => {
        if (closed) return reject(new Error("The gateway is closing."));
        if (signal.aborted) return reject(cancellation(signal));
        const id = randomBytes(24).toString("base64url");
        let state: "waiting" | "taken" | "over" = "waiting";
        const timer = setTimeout(() => end(new Error("The agent did not answer the call in time.")), ttl);
        const onAbort = (): void => end(cancellation(signal));
        signal.addEventListener("abort", onAbort, { once: true });

        function end(reason: Error): void {
          if (state === "over") return;
          state = "over";
          clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          waiting.delete(id);
          reject(reason);
        }

        waiting.set(id, {
          id,
          answerer,
          told: false,
          end,
          take() {
            state = "taken";
            waiting.delete(id);
            clearTimeout(timer);
            return {
              arrive(connection) {
                // Whoever asked may have gone while the agent's connection was opening.
                if (state !== "taken") return void connection.destroy();
                state = "over";
                signal.removeEventListener("abort", onAbort);
                resolve(connection);
              },
              abandon: () => end(new Error("The agent's connection for the call did not open.")),
            };
          },
        });
        for (const ask of [...asking]) ask.wake();
      });
    },

    next(answerer, signal) {
      return new Promise<string[]>((resolve, reject) => {
        if (closed) return reject(new Error("The gateway is closing."));
        if (signal?.aborted === true) return reject(cancellation(signal));
        const told = toldOf(answerer);
        if (told.length > 0) return resolve(told);

        const ask: Ask = {
          answerer,
          wake() {
            const ids = toldOf(answerer);
            if (ids.length === 0) return;
            leave();
            resolve(ids);
          },
          stop(reason) {
            leave();
            reject(reason);
          },
        };
        const onAbort = (): void => ask.stop(cancellation(signal));
        function leave(): void {
          asking.delete(ask);
          signal?.removeEventListener("abort", onAbort);
        }
        asking.add(ask);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },

    answer: (id) => waiting.get(id)?.take(),

    end(answerer) {
      const gone = new Error("The agent's connection ended.");
      for (const call of [...waiting.values()]) if (call.answerer === answerer) call.end(gone);
      for (const ask of [...asking]) if (ask.answerer === answerer) ask.stop(gone);
    },

    close() {
      closed = true;
      const gone = new Error("The gateway is closing.");
      for (const call of [...waiting.values()]) call.end(gone);
      for (const ask of [...asking]) ask.stop(gone);
    },
  };
}

/** What a cancelled wait fails with: the reason it was cancelled for, or the plain fact. */
function cancellation(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new DOMException("The wait was cancelled", "AbortError");
}
