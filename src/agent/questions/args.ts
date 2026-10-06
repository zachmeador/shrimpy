import { delayMs, normalizeDelay } from "../home/index.ts";
import * as words from "./words.ts";

/** How long the agent waits for an answer when it says nothing, and the shortest and the longest it may ask to wait, in milliseconds. */
export const DEFAULT_WITHIN = 30 * 60_000;
export const SHORTEST_WITHIN = 60_000;
export const LONGEST_WITHIN = 24 * 3_600_000;

/** How many characters of a question are kept to say which one it was. */
const START_LENGTH = 80;

/** How long to wait for the answer, in milliseconds, or why what the model wrote can't be used, in words for the model. */
export type Within = { ms: number } | { problem: string };

/**
 * How long the model asked to wait, written as `check_back` writes a delay. Left
 * out or left empty it is `DEFAULT_WITHIN`. `shortest` is the least it may be.
 */
export function readWithin(written: string | undefined, shortest: number): Within {
  const text = written?.trim();
  if (text === undefined || text === "") return { ms: DEFAULT_WITHIN };
  const delay = normalizeDelay(text);
  if (delay === undefined) return { problem: words.badWithin(text) };
  const ms = delayMs(delay);
  if (ms < shortest) return { problem: words.tooSoon(shortest) };
  if (ms > LONGEST_WITHIN) return { problem: words.tooFar(LONGEST_WITHIN) };
  return { ms };
}

/** The name in `@name`, or nothing when the model wrote something else. */
export function readTo(written: string): string | undefined {
  return /^@(.+)$/s.exec(written.trim())?.[1]?.trim();
}

/** The start of a question on one line, which says which question it was. */
export function startOf(text: string): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, START_LENGTH).join("");
}
