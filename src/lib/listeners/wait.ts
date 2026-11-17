import { asError } from "../errors/index.ts";

/**
 * Wait until `listen` hears something, or until `signal` aborts, whichever comes
 * first, and stop listening either way. `listen` starts listening, calls `heard`
 * with what it hears, and gives back what stops it. A wait that is stopped
 * rejects with the reason the signal aborts with, so it never looks like one that
 * heard.
 */
export function untilHeard<T = void>(listen: (heard: (value: T) => void) => () => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) return reject(asError(signal.reason));
    // Read through an object: what is heard can come before `listen` gives back what stops it.
    const wait: { over: boolean; stop?: () => void } = { over: false };
    const end = (): void => {
      wait.over = true;
      wait.stop?.();
      signal?.removeEventListener("abort", abort);
    };
    function abort(this: AbortSignal): void {
      if (wait.over) return;
      end();
      reject(asError(this.reason));
    }
    signal?.addEventListener("abort", abort, { once: true });
    wait.stop = listen((value) => {
      if (wait.over) return;
      end();
      resolve(value);
    });
    if (wait.over) wait.stop();
  });
}

/** Resolve once `signal` aborts, holding nothing up until then. */
export function untilAborted(signal: AbortSignal): Promise<void> {
  return untilHeard(() => () => undefined, signal).catch(() => undefined);
}
