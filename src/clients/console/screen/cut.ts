import { oneLine } from "../../../lib/plain/index.ts";
import { cutEnd, cutStart } from "../../../lib/text/index.ts";

/** The last `characters` characters of `text`, and how many were left out before them. */
export function lastCharacters(text: string, characters: number): { text: string; cut: number } {
  const kept = cutStart(text, characters);
  return { text: kept, cut: text.length - kept.length };
}

/** `text` on one line, as `oneLine` makes it, and no longer than `characters`, made from only the start of a long text. */
export function shortLine(text: string, characters: number): string {
  return cutEnd(oneLine(cutEnd(text, characters * 4)), characters);
}

/** How many lines `text` has: one more than its line breaks. */
export function countLines(text: string): number {
  let lines = 1;
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) lines += 1;
  return lines;
}

/**
 * The last `lines` lines of `text`, and no more than its last `characters`
 * characters, for what streams and grows and may have one line of megabytes.
 */
export function lastLines(text: string, lines: number, characters = Number.POSITIVE_INFINITY): string {
  const kept = cutStart(text, characters);
  let from = kept.endsWith("\n") ? kept.length - 1 : kept.length;
  for (let seen = 0; seen < lines; seen++) {
    if (from <= 0) return kept;
    const before = kept.lastIndexOf("\n", from - 1);
    if (before === -1) return kept;
    from = before;
  }
  return kept.slice(from + 1);
}
