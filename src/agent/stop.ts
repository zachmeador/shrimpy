import type { Host } from "./host/index.ts";
import type { Joined } from "./join.ts";
import type { AgentServer } from "./server.ts";
import type { Run } from "./sessions/index.ts";

export interface CloseOptions {
  /** Do not wait for running turns. What they had done is kept, and they resume at the next start. */
  now?: boolean;
  /** How long running turns get to finish before they are paused. */
  graceMs?: number;
}

const DEFAULT_GRACE_MS = 5_000;

/** What an agent is made of, in the order it is taken down. */
export interface Parts {
  host: Host;
  server: AgentServer;
  /** The agent's run, which the stop ends in the records just before the engine closes. */
  run: Run;
  /** Absent for an agent that takes no part in chat. */
  joined?: Joined;
}

/**
 * How an agent stops: it stops taking new input, from clients and from chat,
 * gives running turns a short time to finish and their replies a moment to be
 * told to chat, then leaves the network and closes the server and the home.
 * Work that did not finish is paused and resumes at the next start, and the
 * records say the stop was an orderly one, so it does not count against the
 * turns it paused. Stopping twice does it once; the second call with `now` cuts
 * the wait short.
 */
export function stopper(parts: Parts): (options?: CloseOptions) => Promise<void> {
  const hurry = new AbortController();
  let stopping: Promise<void> | undefined;
  return (options = {}) => {
    if (options.now === true) hurry.abort();
    stopping ??= stop(parts, options.graceMs ?? DEFAULT_GRACE_MS, hurry.signal);
    return stopping;
  };
}

async function stop({ host, server, run, joined }: Parts, graceMs: number, hurry: AbortSignal): Promise<void> {
  server.stopIntake();
  joined?.stopTaking();
  try {
    if (!hurry.aborted) {
      const deadline = AbortSignal.any([hurry, AbortSignal.timeout(graceMs)]);
      await host.settle(deadline);
      await joined?.drain(deadline);
    }
  } finally {
    try {
      await joined?.close();
    } finally {
      try {
        await server.close();
      } finally {
        try {
          await run.stopped();
        } finally {
          await host.close();
        }
      }
    }
  }
}
