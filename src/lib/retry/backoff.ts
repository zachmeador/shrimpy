export interface Backoff {
  /** The next pause in milliseconds. Each call lengthens the one after it, up to the maximum. */
  next(): number;
  /** Start over from the first pause, once something worked. */
  reset(): void;
}

export interface BackoffOptions {
  firstMs?: number;
  maxMs?: number;
  /** A number in [0, 1), like `Math.random`. Tests replace it. */
  random?: () => number;
}

/** Pauses that double from `firstMs` to `maxMs`, each shortened by up to a quarter at random. */
export function backoff(options: BackoffOptions = {}): Backoff {
  const first = options.firstMs ?? 250;
  const max = options.maxMs ?? 15_000;
  const random = options.random ?? Math.random;
  let current = first;
  return {
    next() {
      // Programs that lost the same peer would otherwise all retry at the same moment.
      const pause = Math.round(current * (1 - random() * 0.25));
      current = Math.min(current * 2, max);
      return pause;
    },
    reset() {
      current = first;
    },
  };
}
