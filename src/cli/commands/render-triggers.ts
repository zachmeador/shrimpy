import { describeSchedule, type TriggerDefinition } from "../../agent/index.ts";
import type { Check, Occurrence, TriggerDetail, TriggerSchedule, TriggerSummary } from "../../contracts/agent/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { indent } from "./render.ts";
import { renderTable } from "./table.ts";

/** A length of time in its two largest units: "2 hours 30 minutes", "5 minutes", "1 day". */
function howLong(milliseconds: number): string {
  const seconds = Math.round(Math.abs(milliseconds) / 1_000);
  const counts = [
    Math.floor(seconds / 86_400),
    Math.floor((seconds % 86_400) / 3_600),
    Math.floor((seconds % 3_600) / 60),
    seconds % 60,
  ];
  const names = ["day", "hour", "minute", "second"];
  const first = Math.max(
    0,
    counts.findIndex((count) => count > 0),
  );
  return counts
    .slice(first, first + 2)
    .flatMap((count, index) => (count > 0 ? [`${count} ${names[first + index] ?? ""}${count === 1 ? "" : "s"}`] : []))
    .join(" ");
}

/** A time with how far it is from `now`: "2026-10-06T03:00:00+02:00, in 9 hours 12 minutes". */
export function when(time: number, now: number): string {
  const distance = Math.abs(time - now) < 1_000 ? "now" : time > now ? `in ${howLong(time - now)}` : `${howLong(now - time)} ago`;
  return `${localTime(time)}, ${distance}`;
}

/** How an occurrence stands, on one line: how it ended, or that it is still going, and why when it says. */
function ending(occurrence: Occurrence): string {
  const how = occurrence.ended ?? "running";
  return occurrence.reason === null ? how : `${how}: ${occurrence.reason.replace(/\s*\n\s*/g, " ")}`;
}

/**
 * When a trigger last checked, for a table: the time, and "quiet" before it when
 * the check found no news, with how many in a row when it was not the first.
 */
function checkedCell(last: TriggerSummary["lastCheck"]): string {
  if (last === null) return "-";
  if (last.quiet === 0) return localTime(last.at);
  return `quiet ${localTime(last.at)}${last.quiet > 1 ? `, ${String(last.quiet)} in a row` : ""}`;
}

/** How a trigger's checks have gone, on one line: when it last checked, and when it was quiet, how many checks before it were too. */
function checkedText(last: TriggerSummary["lastCheck"], now: number): string {
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
  return `${when(last.at, now)}${quiet}`;
}

/** The triggers of a running agent as a table, with a column for when each last checked if any of them has. */
export function renderTriggers(triggers: TriggerSummary[]): string[] {
  const checked = triggers.some((trigger) => trigger.lastCheck !== null);
  const rows = triggers.map((trigger) => [
    trigger.name,
    describeSchedule(trigger.schedule),
    trigger.on ? "on" : "off",
    trigger.next === null ? "-" : localTime(trigger.next),
    trigger.last === null ? "-" : `${trigger.last.ended ?? "running"} ${localTime(trigger.last.firedAt)}`,
    ...(checked ? [checkedCell(trigger.lastCheck)] : []),
  ]);
  return renderTable(["trigger", "schedule", "state", "next", "last", ...(checked ? ["checked"] : [])], rows);
}

/** The triggers a home's files hold as a table: what the files say, and nothing a running agent would add. */
export function renderTriggerFiles(triggers: TriggerDefinition[]): string[] {
  const rows = triggers.map((trigger) => [
    trigger.name,
    describeSchedule(trigger.schedule),
    trigger.enabled ? "on" : "off",
    trigger.thread ?? "a session of its own",
  ]);
  return renderTable(["trigger", "schedule", "state", "goes to"], rows);
}

/** What a trigger's file says, which a running agent and the file alone both know. */
interface Defined {
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

/** What a trigger's file says as lines, with a line for when it runs next if `next` says, and for how its checks have gone if `checked` says. */
function definition(trigger: Defined, next?: string, checked?: string): string[] {
  const goesTo =
    trigger.check?.then === "note"
      ? "nobody: it only leaves a breadcrumb"
      : trigger.thread === null
        ? `a session of its own${trigger.session === null ? "" : `, ${trigger.session}`}. What the agent writes last there is posted nowhere.`
        : `thread ${trigger.thread}. What the agent writes last is posted there.`;
  const overlap =
    trigger.overlap === "skip"
      ? "skip: an occurrence that is due while the last is still going is skipped"
      : "allow: an occurrence that is due while the last is still going waits behind it";
  return [
    `${trigger.name}: ${trigger.on ? "on" : "off"}`,
    `  schedule  ${describeSchedule(trigger.schedule)}`,
    ...(next === undefined ? [] : [`  next      ${next}`]),
    ...(checked === undefined ? [] : [`  checked   ${checked}`]),
    `  goes to   ${goesTo}`,
    `  overlap   ${overlap}`,
    ...(trigger.check === null ? [] : checkLines(trigger.name, trigger.check)),
    ...(trigger.prompt === "" ? ["  prompt    none"] : ["  prompt", ...indent(trigger.prompt).map((line) => `  ${line}`)]),
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
  return [
    `  check     ${command}`,
    `  when      ${news}`,
    `  then      ${does}`,
    `  timeout   ${timeout}`,
  ];
}

/** One trigger of a running agent: its definition, when it runs next, how its checks have gone, and its latest occurrences. */
export function renderTrigger(trigger: TriggerDetail, now: number): string[] {
  const next = trigger.next === null ? "never: it is off" : when(trigger.next, now);
  const lines = definition(trigger, next, trigger.check === null ? undefined : checkedText(trigger.lastCheck, now));
  if (trigger.occurrences.length === 0) return [...lines, "", trigger.lastCheck === null ? "It has not run yet." : "It has made no occurrence yet."];
  const rows = trigger.occurrences.map((occurrence) => [localTime(occurrence.firedAt), occurrence.byHand ? "by hand" : "on schedule", ending(occurrence)]);
  return [...lines, "", "Occurrences, newest first:", ...renderTable(["fired", "how", "ended"], rows).map((line) => `  ${line}`)];
}

/** One trigger as its file says it. */
export function renderTriggerFile(trigger: TriggerDefinition): string[] {
  return definition({ ...trigger, on: trigger.enabled, session: null, check: trigger.check ?? null });
}
