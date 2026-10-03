import type { Store } from "../store/index.ts";

/** Let everything that is ready to run, run. */
export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** What has become of a promise so far. */
export interface Outcome<T> {
  done: boolean;
  value?: T;
  error?: unknown;
}

/** Follow a promise without waiting for it. */
export function follow<T>(promise: Promise<T>): Outcome<T> {
  const outcome: Outcome<T> = { done: false };
  promise.then(
    (value) => {
      outcome.done = true;
      outcome.value = value;
    },
    (error: unknown) => {
      outcome.done = true;
      outcome.error = error;
    },
  );
  return outcome;
}

/** The same store, counting how many watchers are listening to it. */
export function countWatchers(store: Store): { store: Store; watching(): number } {
  let watching = 0;
  return {
    store: {
      ...store,
      subscribe(listener) {
        watching += 1;
        const stop = store.subscribe(listener);
        let stopped = false;
        return () => {
          if (stopped) return;
          stopped = true;
          watching -= 1;
          stop();
        };
      },
    },
    watching: () => watching,
  };
}
