import { oneLine, plain } from "../../lib/plain/index.ts";
import { withoutPeriod } from "../../lib/text/index.ts";
import { roomLabel, triggerLabel } from "../chat/index.ts";
import { describeSchedule } from "./schedule.ts";
import type {
  AnswerEnding,
  Check,
  ModelId,
  Occurrence,
  SessionActivity,
  SessionItem,
  SessionPlace,
  SessionStatus,
  ToolStatus,
  TriggerDetail,
  TriggerSchedule,
  TriggerSummary,
  WaitingWakeup,
} from "./shapes.ts";

/*
 * How a session is said, the one way the terminal and the commands say it:
 * what it is doing, where it is, how a tool call or an answer stands, where it
 * was reset, an image it was shown, its model, what it has used and a wake-up
 * it waits on. Each client frames these words its own way. A name, an ID or a
 * note that came from another program is put on one line and made harmless
 * here, whoever calls.
 */

/** What a session is doing: "idle", "working", "answering", "running bash" or "retrying after: …". */
export function activityWords(activity: SessionActivity): string {
  switch (activity.kind) {
    case "idle":
      return "idle";
    case "working":
      return "working";
    case "answering":
      return "answering";
    case "tool":
      return `running ${oneLine(activity.name)}`;
    case "retrying":
      return `retrying after: ${oneLine(activity.error)}`;
  }
}

/** The DM of whoever looks with the agent, as a place says it is theirs. */
export const YOUR_DM = "your DM";

/**
 * Where a session is, without which thread of it: "DM with mechanic", "#ops"
 * or "trigger nightly". `you` is the name of whoever looks, when it is known:
 * their own DM with the agent is "your DM".
 */
export function placeLabel(place: SessionPlace, you?: string): string {
  switch (place.kind) {
    case "dm":
      return place.with.kind === "person" && place.with.name === you ? YOUR_DM : `DM with ${oneLine(place.with.name)}`;
    case "room":
      return roomLabel(place.room);
    case "trigger":
      return triggerLabel(place.trigger);
  }
}

/** A session's place that is a thread of a channel. */
type InChannel = Exclude<SessionPlace, { kind: "trigger" }>;

/** A thread of a session's place by its name, or by its address when it has no name; and whether it has a name. */
export function threadName(place: InChannel, address: string): { label: string; named: boolean } {
  const name = place.thread.name === null ? "" : oneLine(place.thread.name);
  return name === "" ? { label: `thread ${oneLine(address)}`, named: false } : { label: name, named: true };
}

/** Where a session is, with which thread of it: "DM with mechanic · thread thr_1", "#ops · deploys" or "trigger nightly". */
export function placeWords(place: SessionPlace, address: string, you?: string): string {
  return place.kind === "trigger" ? placeLabel(place, you) : `${placeLabel(place, you)} · ${threadName(place, address).label}`;
}

/** How a tool call stands: "waiting", "running", "done", "failed" or "interrupted, not run again". */
export function toolStatusWords(status: ToolStatus): string {
  switch (status) {
    case "pending":
      return "waiting";
    case "running":
      return "running";
    case "done":
      return "done";
    case "error":
      return "failed";
    case "interrupted":
      return "interrupted, not run again";
  }
}

/** How an answer ended that did not end the way an answer does, or nothing when it did. */
export function endingWords(ended: AnswerEnding | undefined): string | undefined {
  if (ended === "interrupted") return "interrupted";
  if (ended === "failed") return "failed";
  return undefined;
}

/** What marks where a session was reset or compacted. */
export const markerWords = (marker: Extract<SessionItem, { type: "marker" }>["marker"]): string =>
  marker === "reset" ? "session reset" : "session compacted";

/** An image the model was shown, named by its media type. */
export const imageWords = (mimeType: string): string => `[image: ${oneLine(mimeType)}]`;

/** A model as Shrimpy writes it, and as `/model` and `--model` take it: its provider, a slash and its ID. */
export const modelWords = (model: ModelId): string => `${oneLine(model.provider)}/${oneLine(model.id)}`;

/** What a session has used: "1,234 tokens in, 56 out, cost $0.0012". */
export function usageWords(usage: SessionStatus["usage"]): string {
  const count = (tokens: number): string => tokens.toLocaleString("en-US");
  return `${count(usage.input)} tokens in, ${count(usage.output)} out, cost $${usage.cost.toFixed(4)}`;
}

/** The note a wake-up brings, on one line. */
export const wakeupNote = (wakeup: WaitingWakeup): string => withoutPeriod(oneLine(wakeup.note));

/** A wake-up a session waits on: when it comes, as `when` writes it, and the note it brings. */
export const wakeupWords = (wakeup: WaitingWakeup, when: string): string => `Checks back at ${when}: ${wakeupNote(wakeup)}`;

/*
 * How a trigger is said, the one way the commands and the page say it: whether
 * it is on, what defines it, how its checks have gone and how its last
 * occurrence went. Each frames these lines its own way and says a time its own
 * way, and what came from the agent is made harmless here.
 */

/** Whether a trigger is on: "on" or "off". */
export const triggerState = (on: boolean): string => (on ? "on" : "off");

/** A trigger's name and whether it is on, the line over what defines it. */
export const triggerHeading = (trigger: { name: string; on: boolean }): string => `${oneLine(trigger.name)}: ${triggerState(trigger.on)}`;

/** What a trigger's file says, which a running agent and the file alone both know. */
export interface TriggerDefined {
  name: string;
  on: boolean;
  schedule: TriggerSchedule;
  thread: string | null;
  /** The address of the session of its own, when the agent says it. */
  session: string | null;
  overlap: "skip" | "allow";
  check: Check | null;
  prompt: string;
}

/** What a trigger's file says, a line each, to go under its heading. */
export const triggerFields = (trigger: TriggerDefined): string[] => fields(trigger);

/**
 * What a running agent says of one of its triggers, a line each, to go under
 * its heading: what its file says, and after its schedule when it runs next
 * and how its checks have gone, each time as `at` says it.
 */
export function runningTriggerFields(trigger: TriggerDetail, at: (time: number) => string): string[] {
  const next = trigger.next === null ? "never: it is off" : at(trigger.next);
  return fields(trigger, next, trigger.check === null ? undefined : checkedWords(trigger.lastCheck, at));
}

/** That a trigger has made no occurrence yet: it has not run, or its check has found no news. */
export const notRunWords = (trigger: Pick<TriggerSummary, "lastCheck">): string =>
  trigger.lastCheck === null ? "It has not run yet." : "It has made no occurrence yet.";

/** How an occurrence ended, or that it is still going, then when it fired, as `firedAt` writes it. */
export const lastWords = (occurrence: Pick<Occurrence, "ended">, firedAt: string): string => `${occurrence.ended ?? "running"} ${firedAt}`;

/** What defines a trigger as lines, with a line for when it runs next if `next` says, and for how its checks have gone if `checked` says. */
function fields(trigger: TriggerDefined, next?: string, checked?: string): string[] {
  const goesTo =
    trigger.check?.then === "note"
      ? "nobody: it only leaves a breadcrumb"
      : trigger.thread === null
        ? `a session of its own${trigger.session === null ? "" : `, ${oneLine(trigger.session)}`}. What the agent writes last there is posted nowhere.`
        : `thread ${oneLine(trigger.thread)}. What the agent writes last is posted there.`;
  const overlap =
    trigger.overlap === "skip"
      ? "skip: an occurrence that is due while the last is still going is skipped"
      : "allow: an occurrence that is due while the last is still going waits behind it";
  const prompt = plain(trigger.prompt);
  return [
    `schedule  ${describeSchedule(trigger.schedule)}`,
    ...(next === undefined ? [] : [`next      ${next}`]),
    ...(checked === undefined ? [] : [`checked   ${checked}`]),
    `goes to   ${goesTo}`,
    `overlap   ${overlap}`,
    ...(trigger.check === null ? [] : checkLines(oneLine(trigger.name), trigger.check)),
    ...(prompt === "" ? ["prompt    none"] : ["prompt", ...prompt.split("\n").map((line) => `  ${line}`)]),
  ];
}

/** What a trigger's check says: the command, what counts as news, what news does, and how long the command may run. */
function checkLines(name: string, { command, when, then, timeout }: Check): string[] {
  const news = {
    changed: "changed: news is output that differs from the last occurrence's, and the first occurrence's always does",
    output: "output: news is any output at all",
    always: "always: every occurrence is news",
  }[when];
  const does = {
    wake: "wake: the agent is woken with the prompt and, apart from it, the output, which it reads as data",
    note: `note: the output is written to breadcrumbs/${name}.md, below the prompt if there is one, and nobody is woken`,
  }[then];
  return [`check     ${oneLine(command)}`, `when      ${news}`, `then      ${does}`, `timeout   ${oneLine(timeout)}`];
}

/** How a trigger's checks have gone, on one line: when it last checked, and when it was quiet, how many checks before it were too. */
function checkedWords(last: TriggerSummary["lastCheck"], at: (time: number) => string): string {
  if (last === null) return "not yet";
  const before = last.quiet - 1;
  const quiet =
    last.quiet === 0
      ? ""
      : before === 0
        ? ": quiet"
        : before === 1
          ? ": quiet, as was the check before it"
          : `: quiet, as were the ${String(before)} checks before it`;
  return `${at(last.at)}${quiet}`;
}
