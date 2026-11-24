import { capitalize } from "../../lib/text/index.ts";
import type { Io } from "../io/index.ts";
import { describeEnd } from "../programs/index.ts";
import type { Started } from "./launch.ts";

/** Stop requests: a count, a promise for the first, and a signal for the lookups that wait on them. */
export interface StopWatch {
  /** Settles at the first request. */
  asked: Promise<void>;
  /** Aborted at the first request, to end a lookup that is waiting for a gateway that does not answer. */
  signal: AbortSignal;
  requests(): number;
  release(): void;
}

/**
 * Listen for stop requests before anything starts, since whoever reads the first
 * line may signal at once. The first request stops everything in order. A second
 * is a second SIGTERM for the agents, which tells each to stop without waiting
 * for its running turns. The gateway and the chat server get one SIGTERM, when
 * their turn comes: once they have closed nothing listens for another, and the
 * signal would end them instead of being ignored. A third request kills everything.
 */
export function watchForStop(io: Io, crew: Started[]): StopWatch {
  const aborted = new AbortController();
  let count = 0;
  let wake = (): void => undefined;
  const asked = new Promise<void>((resolveAsked) => {
    wake = resolveAsked;
  });
  const release = io.onStop(() => {
    count += 1;
    aborted.abort();
    for (const member of crew) {
      if (count === 2 && member.role === "agent") member.program.signal("SIGTERM");
      if (count > 2) member.program.signal("SIGKILL");
    }
    wake();
  });
  return { asked, signal: aborted.signal, requests: () => count, release };
}

/**
 * Stop what was started, agents first and the gateway last, so that an agent
 * can finish what it is posting while chat is still there. True if a program
 * ended in a way a stop does not explain, unless it was ended by force.
 */
export async function stopAll(io: Io, crew: Started[], forced: boolean): Promise<boolean> {
  if (crew.length === 0) return false;
  io.out(
    io.terminal
      ? "Stopping what this command started. Another Ctrl+C stops without waiting."
      : "Stopping what this command started.",
  );
  let abnormal = false;
  for (const role of ["agent", "chat", "gateway"] as const) {
    const these = crew.filter((member) => member.role === role);
    const endings = await Promise.all(these.map((member) => member.program.stop()));
    these.forEach((member, index) => {
      const ended = endings[index];
      const clean = ended === undefined || (ended.code === 0 && ended.signal === null);
      if (clean || forced || member.endedByItself === true) return;
      abnormal = true;
      io.err(`${capitalize(member.what)} ended with ${describeEnd(ended)} when it was stopped.`);
    });
  }
  io.out("Everything this command started has stopped.");
  return abnormal;
}
