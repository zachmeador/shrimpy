/** How long saying goodbye may take before the connection is dropped anyway. */
export const GOODBYE_MS = 1_000;

/**
 * Wait for a goodbye to finish, but not for long: a server that has stopped
 * answering must not hold a connection open. A server lets go of what a
 * dropped connection held, so a goodbye that did not finish loses nothing.
 * Resolves true if it finished in time, whether it succeeded or not.
 */
export function politely(goodbye: Promise<unknown>, ms = GOODBYE_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const finished = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    goodbye.then(finished, finished);
  });
}
