import type { SessionItem, SessionView } from "../../../contracts/agent/index.ts";
import { lastLines, oneLine, plain } from "./plain.ts";
import { answerNote, hiddenLines, hiddenSteps, THINKING, toolStatus } from "./words.ts";

/** One thing the agent is doing or has done in the turn it is working on now. */
export type Step =
  | { kind: "thinking"; label: string; text: string }
  | { kind: "text"; text: string; note: string | undefined }
  | {
      kind: "tool";
      name: string;
      call: string;
      /** How the call stands, with a mark: done, running, failed. */
      status: string;
      /** The tool's severity for how it is drawn. */
      tone: "good" | "bad" | "busy" | "idle";
      /** The last lines of what it printed. */
      output: string[];
      /** How many earlier lines of output there were, in words, when there were more. */
      earlier: string | undefined;
      notes: string[];
    };

/** The work in progress behind the open thread: what the agent is doing, not what was said. */
export interface Work {
  steps: Step[];
  /** In words, how many steps of this turn come before the ones shown, when some do. */
  earlier: string | undefined;
}

/** The most steps of one turn shown. A turn that uses many tools shows the latest. */
const MAX_STEPS = 12;
/** What is kept of what streams: the lines a person could see are far fewer, and a line can be megabytes long. */
const THINKING_LINES = 2;
const THINKING_CHARACTERS = 2_000;
const TEXT_LINES = 80;
const TEXT_CHARACTERS = 20_000;
const OUTPUT_LINES = 6;
/** What is read of a tool's output to find those lines. */
const OUTPUT_READ_LINES = 40;
const OUTPUT_CHARACTERS = 8_000;
const CALL_CHARACTERS = 300;

/**
 * The work in the session's current turn, or none when the session is not
 * working. The turn starts after the last input the session was given: what
 * that said is in the thread. Thinking, the answer so far and the tool calls
 * with their status and output follow, and when the turn settles the reply is
 * a message in the thread and this goes away.
 */
export function workOf(session: SessionView | undefined): Work | undefined {
  if (session?.status.busy !== true) return undefined;
  const live = session.items.slice(session.items.findLastIndex((item) => item.type === "user") + 1);
  const steps = live.flatMap(stepsOf);
  const shown = steps.slice(-MAX_STEPS);
  const left = steps.length - shown.length;
  return { steps: shown, earlier: left > 0 ? hiddenSteps(left) : undefined };
}

function stepsOf(item: SessionItem): Step[] {
  switch (item.type) {
    case "user":
    case "marker":
      return [];
    case "assistant": {
      const steps: Step[] = [];
      if (item.thinking.trim() !== "") {
        steps.push({ kind: "thinking", label: THINKING, text: plain(lastLines(item.thinking.trim(), THINKING_LINES, THINKING_CHARACTERS)) });
      }
      const cutOff = answerNote(item.stopReason);
      if (item.text.trim() !== "" || cutOff !== undefined) {
        steps.push({ kind: "text", text: plain(lastLines(item.text.trimEnd(), TEXT_LINES, TEXT_CHARACTERS)), note: cutOff });
      }
      return steps;
    }
    case "tool": {
      const lines = plain(lastLines(item.output.trimEnd(), OUTPUT_READ_LINES, OUTPUT_CHARACTERS)).split("\n");
      const shown = lines.slice(-OUTPUT_LINES);
      const status = toolStatus(item.status);
      return [
        {
          kind: "tool",
          name: oneLine(item.name),
          call: callOf(item.name, item.args),
          status: status.label,
          tone: status.tone,
          output: shown.length === 1 && shown[0] === "" ? [] : shown,
          earlier: lines.length > shown.length ? hiddenLines(lines.length - shown.length) : undefined,
          notes: item.notes.map(oneLine),
        },
      ];
    }
  }
}

/** A tool call on one line: the command for the shell, the arguments for any other. */
function callOf(name: string, args: string): string {
  let call = args === "{}" ? "" : args;
  try {
    const parsed = JSON.parse(args) as { command?: unknown } | null;
    if (name === "bash" && typeof parsed?.command === "string") call = `$ ${parsed.command}`;
  } catch {
    // Arguments that are not JSON are shown as they are.
  }
  return oneLine(call.slice(0, CALL_CHARACTERS * 4)).slice(0, CALL_CHARACTERS);
}
