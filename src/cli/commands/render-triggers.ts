import {
  describeSchedule,
  lastWords,
  notRunWords,
  type Occurrence,
  runningTriggerFields,
  type TriggerDefined,
  type TriggerDetail,
  triggerFields,
  triggerHeading,
  triggerState,
  type TriggerSummary,
} from "../../contracts/agent/index.ts";
import type { TriggerDefinition } from "../../contracts/agent/node.ts";
import { howLong, localTime } from "../../lib/time/index.ts";
import { renderTable } from "./table.ts";

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

/** The triggers of a running agent as a table, with a column for when each last checked if any of them has. */
export function renderTriggers(triggers: TriggerSummary[]): string[] {
  const checked = triggers.some((trigger) => trigger.lastCheck !== null);
  const rows = triggers.map((trigger) => [
    trigger.name,
    describeSchedule(trigger.schedule),
    triggerState(trigger.on),
    trigger.next === null ? "-" : localTime(trigger.next),
    trigger.last === null ? "-" : lastWords(trigger.last, localTime(trigger.last.firedAt)),
    ...(checked ? [checkedCell(trigger.lastCheck)] : []),
  ]);
  return renderTable(["trigger", "schedule", "state", "next", "last", ...(checked ? ["checked"] : [])], rows);
}

/** The triggers a home's files hold as a table: what the files say, and nothing a running agent would add. */
export function renderTriggerFiles(triggers: TriggerDefinition[]): string[] {
  const rows = triggers.map((trigger) => [
    trigger.name,
    describeSchedule(trigger.schedule),
    triggerState(trigger.enabled),
    trigger.thread ?? "a session of its own",
  ]);
  return renderTable(["trigger", "schedule", "state", "goes to"], rows);
}

/** A trigger's heading, with what defines it indented under it. */
const definition = (trigger: { name: string; on: boolean }, fields: string[]): string[] => [triggerHeading(trigger), ...fields.map((line) => `  ${line}`)];

/** One trigger of a running agent: its definition, when it runs next, how its checks have gone, and its latest occurrences. */
export function renderTrigger(trigger: TriggerDetail, now: number): string[] {
  const lines = definition(trigger, runningTriggerFields(trigger, (time) => when(time, now)));
  if (trigger.occurrences.length === 0) return [...lines, "", notRunWords(trigger)];
  const rows = trigger.occurrences.map((occurrence) => [localTime(occurrence.firedAt), occurrence.byHand ? "by hand" : "on schedule", ending(occurrence)]);
  return [...lines, "", "Occurrences, newest first:", ...renderTable(["fired", "how", "ended"], rows).map((line) => `  ${line}`)];
}

/** One trigger as its file says it. */
export function renderTriggerFile(trigger: TriggerDefinition): string[] {
  const defined: TriggerDefined = { ...trigger, on: trigger.enabled, session: null, check: trigger.check ?? null };
  return definition(defined, triggerFields(defined));
}
