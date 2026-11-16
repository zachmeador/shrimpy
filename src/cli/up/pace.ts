/** How `up` keeps a folder running when it is told no agents. A test gives it shorter times. */
export interface Pace {
  /** How often it looks at the homes of the folder. */
  lookMs: number;
  /** The pause before an agent that ended, or could not start, is started again. It doubles with each failure in a row. */
  pauseMs: number;
  /** The longest the pause grows to. */
  longestPauseMs: number;
  /** How long an agent has to stay up for the pause to start over at `pauseMs`. */
  stableMs: number;
}

export const PACE: Pace = { lookMs: 2_000, pauseMs: 2_000, longestPauseMs: 300_000, stableMs: 60_000 };

/** A length of time as a person says it: "2 seconds", "a minute", "5 minutes". */
export function lengthOf(ms: number): string {
  if (ms < 1_000) return `${String(Math.round(ms))} milliseconds`;
  const seconds = Math.round(ms / 1_000);
  if (seconds === 60) return "a minute";
  if (seconds < 120) return `${String(seconds)} ${seconds === 1 ? "second" : "seconds"}`;
  return `${String(Math.round(seconds / 60))} minutes`;
}
