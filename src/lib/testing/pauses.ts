import { type Backoff, backoff } from "../retry/index.ts";

export interface CountedBackoff extends Backoff {
  /** How many pauses have been asked for. One follows each attempt that has ended, so this is how many attempts have. */
  taken(): number;
}

/** Short pauses between attempts, counted, for a test that waits for a number of attempts to have ended. */
export function countedBackoff(): CountedBackoff {
  const pauses = backoff({ firstMs: 5, maxMs: 20 });
  let taken = 0;
  return {
    next() {
      taken += 1;
      return pauses.next();
    },
    reset: () => pauses.reset(),
    taken: () => taken,
  };
}
