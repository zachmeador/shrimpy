import { type Ending, isOccurrence, type Outstanding, type TurnOutcome } from "./events.ts";

/** What a turn's final text means for the thread it came from. */
export type Reading = { kind: "silent" } | { kind: "reply"; text: string };

// Whitespace, quotes, backticks and asterisks may wrap `END`, and one period may follow it.
const WRAPPERS = "\\s\"'“”‘’`*";
const AROUND = `[${WRAPPERS}]*`;
const END_LINE = new RegExp(`^${AROUND}END${AROUND}\\.?${AROUND}$`);

/** Whether a line is `END`, in the forgiving sense: wrapped in whitespace, quotes, backticks or asterisks, or ending with a period. */
export function isEnd(line: string): boolean {
  return END_LINE.test(line);
}

/**
 * Read the final text of a turn. `END`, or nothing, means the agent has nothing
 * to say. Text whose last line is `END` is posted without that line. A reply is
 * posted without the blank lines a model may put before it or the whitespace
 * after it, and is otherwise as written.
 */
export function readFinalText(text: string): Reading {
  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();
  const last = lines.pop();
  if (last === undefined) return { kind: "silent" };
  if (!isEnd(last)) return { kind: "reply", text: withoutBlankEdges(text) };
  const rest = withoutBlankEdges(lines.join("\n"));
  return rest === "" ? { kind: "silent" } : { kind: "reply", text: rest };
}

/**
 * How a turn ended, as the record of the task that followed its input keeps it.
 * A turn that answered with a reply is answered and one that answered with
 * `END` or nothing is silent, whether or not the reply has anywhere to go. An
 * occurrence that no turn ran says why in the reason it came with.
 */
export function endingOf(input: Outstanding, outcome: TurnOutcome): Ending {
  const reason = isOccurrence(input) && input.unrun !== undefined ? input.unrun.reason : outcome.kind === "failed" ? outcome.reason : undefined;
  const ended: Ending["ended"] =
    outcome.kind === "answered" ? (readFinalText(outcome.text).kind === "reply" ? "answered" : "silent") : outcome.kind;
  return reason === undefined ? { ended } : { ended, reason };
}

/** The text without blank lines in front or whitespace at the end. The first line keeps its indent. */
function withoutBlankEdges(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd();
}

/**
 * Split text into messages of at most `limit` characters. A part ends where a
 * line does when it can end in the later half of what fits, and never splits a
 * character that takes two code units. Parts with nothing in them are dropped,
 * because chat does not take them.
 */
export function inParts(text: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = cutPoint(rest, limit);
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts.filter((part) => part.trim() !== "");
}

function cutPoint(text: string, limit: number): number {
  const lineBreak = text.lastIndexOf("\n", limit - 1);
  if (lineBreak >= limit / 2) return lineBreak + 1;
  const last = text.charCodeAt(limit - 1);
  const splitsAPair = last >= 0xd800 && last <= 0xdbff;
  return Math.max(splitsAPair ? limit - 1 : limit, 1);
}

/** The first `limit` characters, ending in an ellipsis when something was cut, without splitting a two-unit character. */
export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const last = text.charCodeAt(limit - 2);
  const splitsAPair = last >= 0xd800 && last <= 0xdbff;
  return `${text.slice(0, splitsAPair ? limit - 2 : limit - 1)}…`;
}

/**
 * Names a posted reply by the agent's records, the thread's session and the
 * answer it carries, and by which part of the answer it is, so a retry posts
 * nothing twice and several messages answered by one turn share one reply. The
 * engine numbers its entries again in a new database, so what the records are
 * called keeps a reply made after a fresh start from being taken for a retry of
 * an older one.
 */
export function replyRequestId(recordsId: string, threadId: string, answer: string, part: number): string {
  return `reply-${recordsId}-${threadId}-${answer}-${part}`;
}
