import { setTimeout as delay } from "node:timers/promises";

const POLL_MS = 10;

/** Let everything that is ready to run, run. */
export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export interface WaitOptions {
  /** What is being waited for, for the message when it does not happen. */
  what?: string;
  /** How long to wait before giving up. */
  timeoutMs?: number;
}

/** Read until `done` accepts the value, or fail with the last value seen. */
export async function eventually<T>(
  read: () => Promise<T> | T,
  done: (value: T) => boolean,
  options: WaitOptions = {},
): Promise<T> {
  const { what = "the value to be accepted", timeoutMs = 10_000 } = options;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(
        `Gave up waiting for ${what} after ${timeoutMs} ms; the last value was ${JSON.stringify(value)}`,
      );
    }
    await delay(POLL_MS);
  }
}

/** Wait until `condition` holds, and fail naming `what` if it does not in time. */
export async function until(
  condition: () => boolean,
  what = "a condition",
  timeoutMs = 10_000,
): Promise<void> {
  await eventually(condition, (holds) => holds, { what, timeoutMs });
}

/**
 * Resolve with the first view that satisfies `done`, from anything that can be
 * subscribed to, such as an attached session or thread.
 */
export function waitForView<V>(
  handle: { subscribe(listener: (view: V) => void): () => void },
  done: (view: V) => boolean,
): Promise<V> {
  return new Promise((resolve) => {
    // The listener can fire during subscribe(), before there is anything to stop.
    const watch: { finished: boolean; stop?: () => void } = { finished: false };
    watch.stop = handle.subscribe((view) => {
      if (watch.finished || !done(view)) return;
      watch.finished = true;
      watch.stop?.();
      resolve(view);
    });
    if (watch.finished) watch.stop();
  });
}
