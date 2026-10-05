import { type Ending, isOccurrence, type Outstanding, type TurnOutcome } from "./input.ts";

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
