import { describeSchedule, type TriggerDefinition } from "../../agent/index.ts";
import type { Occurrence, TriggerDetail, TriggerSchedule, TriggerSummary } from "../../contracts/agent/index.ts";
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

/** The triggers of a running agent as a table. */
export function renderTriggers(triggers: TriggerSummary[]): string[] {
  const rows = triggers.map((trigger) => [
    trigger.name,
    describeSchedule(trigger.schedule),
    trigger.on ? "on" : "off",
    trigger.next === null ? "-" : localTime(trigger.next),
    trigger.last === null ? "-" : `${trigger.last.ended ?? "running"} ${localTime(trigger.last.firedAt)}`,
  ]);
  return renderTable(["trigger", "schedule", "state", "next", "last"], rows);
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
  prompt: string;
}

/** What a trigger's file says as lines, with a line for when it runs next if `next` says. */
function definition(trigger: Defined, next?: string): string[] {
  const goesTo =
    trigger.thread === null
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
    `  goes to   ${goesTo}`,
    `  overlap   ${overlap}`,
    "  prompt",
    ...indent(trigger.prompt).map((line) => `  ${line}`),
  ];
}

/** One trigger of a running agent: its definition, when it runs next, and its latest occurrences. */
export function renderTrigger(trigger: TriggerDetail, now: number): string[] {
  const lines = definition(trigger, trigger.next === null ? "never: it is off" : when(trigger.next, now));
  if (trigger.occurrences.length === 0) return [...lines, "", "It has not run yet."];
  const rows = trigger.occurrences.map((occurrence) => [localTime(occurrence.firedAt), occurrence.byHand ? "by hand" : "on schedule", ending(occurrence)]);
  return [...lines, "", "Occurrences, newest first:", ...renderTable(["fired", "how", "ended"], rows).map((line) => `  ${line}`)];
}

/** One trigger as its file says it. */
export function renderTriggerFile(trigger: TriggerDefinition): string[] {
  return definition({ ...trigger, on: trigger.enabled, session: null });
}
