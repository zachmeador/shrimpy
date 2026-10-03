import type { ThreadHandle, ThreadView } from "../../contracts/chat/index.ts";
import type { Store } from "../store/index.ts";

/** Let everything that is ready to run, run. */
export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Wait until `condition` holds, and fail if it does not within a few seconds. */
export async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Gave up waiting for a condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

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

/** Resolve with the first view of a thread that satisfies `done`. */
export function waitForView(
  thread: ThreadHandle,
  done: (view: ThreadView) => boolean,
): Promise<ThreadView> {
  return new Promise((resolve) => {
    // The listener can fire during subscribe(), before there is anything to stop.
    const watch: { finished: boolean; stop?: () => void } = { finished: false };
    watch.stop = thread.subscribe((view) => {
      if (watch.finished || !done(view)) return;
      watch.finished = true;
      watch.stop?.();
      resolve(view);
    });
    if (watch.finished) watch.stop();
  });
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
