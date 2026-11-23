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
  let tries = 0;
  return {
    next: () => pauseAfter(tries++, options),
    reset() {
      tries = 0;
    },
  };
}

/**
 * The pause after `tries` failed tries in a row, counting from 0, as `backoff`
 * makes them, for whoever keeps the count itself, such as a task that sleeps
 * between tries.
 */
export function pauseAfter(tries: number, options: BackoffOptions = {}): number {
  const first = options.firstMs ?? 250;
  const max = options.maxMs ?? 15_000;
  const random = options.random ?? Math.random;
  // Programs that lost the same peer would otherwise all retry at the same moment.
  return Math.round(Math.min(first * 2 ** tries, max) * (1 - random() * 0.25));
}
