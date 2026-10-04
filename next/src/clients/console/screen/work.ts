import type { SessionItem, SessionView, ToolStatus } from "../../../contracts/agent/index.ts";
import { lastLines, oneLine, plain } from "./plain.ts";

/** One thing the agent is doing or has done in the turn it is working on now. */
export type Step =
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string; note: string | undefined }
  | { kind: "tool"; name: string; call: string; status: ToolStatus; output: string; notes: string[] };

/** The work in progress behind the open thread: what the agent is doing, not what was said. */
export interface Work {
  steps: Step[];
  /** Steps of this turn before the ones shown. */
  hidden: number;
}

/** The most steps of one turn shown. A turn that uses many tools shows the latest. */
const MAX_STEPS = 12;
/** How much of what streams is kept: the lines a person could see are far fewer. */
const THINKING_LINES = 6;
const TEXT_LINES = 80;
const OUTPUT_LINES = 40;
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
  return { steps: shown, hidden: steps.length - shown.length };
}

function stepsOf(item: SessionItem): Step[] {
  switch (item.type) {
    case "user":
    case "marker":
      return [];
    case "assistant": {
      const steps: Step[] = [];
      if (item.thinking.trim() !== "") steps.push({ kind: "thinking", text: plain(lastLines(item.thinking.trim(), THINKING_LINES)) });
      if (item.text.trim() !== "" || item.stopReason === "aborted" || item.stopReason === "error") {
        steps.push({ kind: "text", text: plain(lastLines(item.text.trimEnd(), TEXT_LINES)), note: stopNote(item.stopReason) });
      }
      return steps;
    }
    case "tool":
      return [
        {
          kind: "tool",
          name: oneLine(item.name),
          call: callOf(item.name, item.args),
          status: item.status,
          output: plain(lastLines(item.output.trimEnd(), OUTPUT_LINES)),
          notes: item.notes.map(oneLine),
        },
      ];
  }
}

function stopNote(stopReason: string | null): string | undefined {
  if (stopReason === "aborted") return "answer interrupted";
  if (stopReason === "error") return "answer failed";
  return undefined;
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
