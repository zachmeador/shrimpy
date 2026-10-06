import type { SessionItem, SessionView } from "../../../contracts/agent/index.ts";
import { countLines, firstCharacters, lastCharacters, lastLines, oneLine, plain } from "./plain.ts";
import {
  answerNote,
  hiddenCharacters,
  hiddenLines,
  hiddenSteps,
  type InFull,
  markerWords,
  moreCharacters,
  SHOWN,
  THINKING,
  toolStatus,
} from "./words.ts";

/** One thing the agent is doing or has done in the turn it is working on now, or, in a session being watched, one thing in it. */
export type Step =
  /** What the session was shown. Only a session being watched has it: the thread says what was said. */
  | {
      kind: "shown";
      label: string;
      text: string;
      /** How much of the start of it is left out, in words, when it was too long to show. */
      earlier: string | undefined;
    }
  | {
      kind: "thinking";
      label: string;
      text: string;
      /** How much of the start of the thinking is left out, in words, when it was too long to show whole. */
      earlier: string | undefined;
    }
  | {
      kind: "text";
      text: string;
      note: string | undefined;
      /** How much of the start of the answer is left out, in words, when a session being watched has more than it shows. */
      earlier: string | undefined;
    }
  | {
      kind: "tool";
      name: string;
      /** The call: on one line when brief, and every argument when whole, which may take many. */
      call: string;
      /** The call and what it printed are shown whole, as far as the limit allows. */
      whole: boolean;
      /** How the call stands, with a mark: done, running, failed. */
      status: string;
      /** The tool's severity for how it is drawn. */
      tone: "good" | "bad" | "busy" | "idle";
      /** What it printed: its last lines when brief, and all of it when whole. */
      output: string[];
      /** How much of the start of the output is left out, in words, when there was more. */
      earlier: string | undefined;
      notes: string[];
    }
  /** Where a session being watched was reset or compacted. */
  | { kind: "marker"; text: string };

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
const OUTPUT_CHARACTERS = 8_000;
const CALL_CHARACTERS = 300;
/**
 * The most of any one thing that is shown in full: a call, what a tool printed,
 * or the thinking of one answer. A line can be megabytes long, so what is whole
 * has a limit too, and says how much it left out.
 */
export const FULL_CHARACTERS = 100_000;

/**
 * The work in the session's current turn, or none when the session is not
 * working. The turn starts after the last input the session was given: what
 * that said is in the thread. Thinking, the answer so far and the tool calls
 * with their status and output follow, and when the turn settles the reply is
 * a message in the thread and this goes away.
 */
export function workOf(session: SessionView | undefined, inFull: InFull): Work | undefined {
  if (session?.status.busy !== true) return undefined;
  const live = session.items.slice(session.items.findLastIndex((item) => item.type === "user") + 1);
  const steps = live.flatMap((item) => stepsOf(item, inFull, false));
  const shown = steps.slice(-MAX_STEPS);
  const left = steps.length - shown.length;
  return { steps: shown, earlier: left > 0 ? hiddenSteps(left) : undefined };
}

/** The most items of a session shown at once, which are its newest. */
const MAX_ITEMS = 200;

/** A session being watched: its newest items as steps, oldest first, and how many items come before them. */
export interface Watched {
  steps: Step[];
  earlier: number;
}

/**
 * What a session holds, as the agent sees it: what it was shown, its thinking,
 * what it wrote, each tool call with what it printed, and where it was reset or
 * compacted. Thinking and tool calls are brief unless asked for in full.
 */
export function watchOf(session: SessionView, inFull: InFull): Watched {
  const shown = session.items.slice(-MAX_ITEMS);
  return { steps: shown.flatMap((item) => stepsOf(item, inFull, true)), earlier: session.items.length - shown.length };
}

/**
 * The steps of one item. `transcript` is for a session being watched, which
 * shows everything in it and an answer whole, where the work of a turn leaves
 * out what was said, which the thread has, and shows the latest of an answer.
 */
function stepsOf(item: SessionItem, inFull: InFull, transcript: boolean): Step[] {
  switch (item.type) {
    case "user": {
      if (!transcript) return [];
      const { text, cut } = lastCharacters(item.text.trimEnd(), FULL_CHARACTERS);
      return [{ kind: "shown", label: SHOWN, text: plain(text), earlier: cut > 0 ? hiddenCharacters(cut) : undefined }];
    }
    case "marker":
      return transcript ? [{ kind: "marker", text: markerWords(item.marker) }] : [];
    case "assistant": {
      const steps: Step[] = [];
      if (item.thinking.trim() !== "") steps.push(thinkingStep(item.thinking.trim(), inFull.thinking));
      const cutOff = answerNote(item.stopReason);
      if (item.text.trim() !== "" || cutOff !== undefined) steps.push(textStep(item.text.trimEnd(), cutOff, transcript));
      return steps;
    }
    case "tool":
      return [toolStep(item, inFull.toolCalls)];
  }
}

function textStep(text: string, note: string | undefined, whole: boolean): Step {
  if (!whole) return { kind: "text", text: plain(lastLines(text, TEXT_LINES, TEXT_CHARACTERS)), note, earlier: undefined };
  const kept = lastCharacters(text, FULL_CHARACTERS);
  return { kind: "text", text: plain(kept.text), note, earlier: kept.cut > 0 ? hiddenCharacters(kept.cut) : undefined };
}

function thinkingStep(thinking: string, whole: boolean): Step {
  if (!whole) {
    return { kind: "thinking", label: THINKING, text: plain(lastLines(thinking, THINKING_LINES, THINKING_CHARACTERS)), earlier: undefined };
  }
  const { text, cut } = lastCharacters(thinking, FULL_CHARACTERS);
  return { kind: "thinking", label: THINKING, text: plain(text), earlier: cut > 0 ? hiddenCharacters(cut) : undefined };
}

function toolStep(item: Extract<SessionItem, { type: "tool" }>, whole: boolean): Step {
  const status = toolStatus(item.status);
  const printed = item.output.trimEnd();
  let lines: string[];
  let earlier: string | undefined;
  if (whole) {
    const { text, cut } = lastCharacters(printed, FULL_CHARACTERS);
    lines = plain(text).split("\n");
    earlier = cut > 0 ? hiddenCharacters(cut) : undefined;
  } else {
    lines = plain(lastLines(printed, OUTPUT_LINES, OUTPUT_CHARACTERS)).split("\n").slice(-OUTPUT_LINES);
    const total = countLines(printed);
    earlier = total > lines.length ? hiddenLines(total - lines.length) : undefined;
  }
  return {
    kind: "tool",
    name: oneLine(item.name),
    call: whole ? wholeCallOf(item.name, item.args) : callOf(item.name, item.args),
    whole,
    status: status.label,
    tone: status.tone,
    output: lines.length === 1 && lines[0] === "" ? [] : lines,
    earlier,
    notes: item.notes.map(oneLine),
  };
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

/**
 * A tool call with every argument, over as many lines as it takes: the command
 * for the shell, with the arguments that go with it, and the arguments for any
 * other tool, one to a line.
 */
function wholeCallOf(name: string, args: string): string {
  let call = args === "{}" ? "" : args;
  try {
    const parsed = JSON.parse(args) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const { command, ...rest } = parsed as Record<string, unknown>;
      const others = Object.keys(rest).length === 0 ? "" : JSON.stringify(rest, null, 2);
      if (name === "bash" && typeof command === "string") call = others === "" ? `$ ${command}` : `$ ${command}\n${others}`;
      else call = Object.keys(parsed).length === 0 ? "" : JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Arguments that are not JSON are shown as they are.
  }
  const { text, cut } = firstCharacters(call, FULL_CHARACTERS);
  return plain(cut > 0 ? `${text}\n${moreCharacters(cut)}` : text).trimEnd();
}
