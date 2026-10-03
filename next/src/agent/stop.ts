import type { Host } from "./host/index.ts";
import type { AgentServer } from "./server.ts";

export interface CloseOptions {
  /** Do not wait for running turns. What they had done is kept, and they resume at the next start. */
  now?: boolean;
  /** How long running turns get to finish before they are paused. */
  graceMs?: number;
}

const DEFAULT_GRACE_MS = 5_000;

/**
 * How an agent stops: it stops taking new input, gives running turns a short
 * time to finish, then closes the server and the home. Work that did not
 * finish is paused and resumes at the next start. Stopping twice does it
 * once; the second call with `now` cuts the wait short.
 */
export function stopper(host: Host, server: AgentServer): (options?: CloseOptions) => Promise<void> {
  const hurry = new AbortController();
  let stopping: Promise<void> | undefined;
  return (options = {}) => {
    if (options.now === true) hurry.abort();
    stopping ??= stop(host, server, options.graceMs ?? DEFAULT_GRACE_MS, hurry.signal);
    return stopping;
  };
}

async function stop(host: Host, server: AgentServer, graceMs: number, hurry: AbortSignal): Promise<void> {
  server.stopIntake();
  try {
    if (!hurry.aborted) await host.settle(AbortSignal.any([hurry, AbortSignal.timeout(graceMs)]));
  } finally {
    try {
      await server.close();
    } finally {
      await host.close();
    }
  }
}
