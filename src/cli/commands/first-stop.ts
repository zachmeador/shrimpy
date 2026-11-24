import type { Io } from "../io/index.ts";

/**
 * A signal that aborts at the first request to stop, as SIGTERM and Ctrl+C make. A second request ends the command at
 * once, as it does for any command, since it is no longer listened for. `release` stops listening.
 */
export function firstStop(io: Io): { signal: AbortSignal; release: () => void } {
  const stopped = new AbortController();
  const release = io.onStop(() => {
    stopped.abort();
    release();
  });
  return { signal: stopped.signal, release };
}
