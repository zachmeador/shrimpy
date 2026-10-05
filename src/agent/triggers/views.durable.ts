import type { JsonValue } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Cursor, Harness, TaskRecord } from "@earendil-works/pi-durable";
import type { Occurrence as OccurrenceView, TriggerSummary } from "../../contracts/agent/index.ts";
import { type Ending, isOccurrence, type OccurrenceInput, type Outstanding } from "../inputs/index.ts";
import type { StoredTrigger } from "../records/durable.ts";
import { TURN_TASK } from "../turns/durable.ts";
import { type Standing, TRIGGER_TASK, type Waiting } from "./task.durable.ts";

const context = BACKGROUND_CONTEXT;

/** How many of a trigger's most recent occurrences are told in its detail. */
export const RECENT = 20;

/** When a trigger's task next wakes, and the revision of the schedule it is for. */
export type NextTime = { revision: number; next: number };

/** When each trigger that is on is next due, from the tasks that wait for them. */
export async function nextTimes(harness: Harness): Promise<Map<string, NextTime>> {
  const { tasks } = await harness.inspect(context);
  const times = new Map<string, NextTime>();
  for (const { record } of tasks) {
    if (record.kind !== TRIGGER_TASK || record.abortRequested || !("checkpoint" in record.state)) continue;
    const { revision, next } = record.state.checkpoint as Standing;
    times.set((record.input as Waiting).name, { revision, next });
  }
  return times;
}

/**
 * Every occurrence the agent's records hold, in the order they were made, as
 * the engine keeps them: the tasks that follow inputs, of which these are the
 * ones that follow an occurrence. A page at a time, so a long record does not
 * hold up the engine's other commits.
 */
export async function occurrences(harness: Harness): Promise<{ trigger: string; view: OccurrenceView }[]> {
  const found: { trigger: string; view: OccurrenceView }[] = [];
  let cursor: Cursor | undefined;
  do {
    const page = await harness.commit((tx) => tx.scanTasks({ kind: TURN_TASK }, 200, cursor), context);
    for (const record of page.items) {
      const input = record.input as Outstanding;
      if (isOccurrence(input)) found.push({ trigger: input.occurrence.trigger, view: occurrenceView(input, record) });
    }
    cursor = page.next;
  } while (cursor !== undefined);
  return found;
}

/** A trigger as the list tells it: its schedule, whether it is on, when it is next due and how its last occurrence ended. */
export function summaryOf(trigger: StoredTrigger, next: NextTime | undefined, last: OccurrenceView | undefined): TriggerSummary {
  const { definition } = trigger;
  return {
    name: definition.name,
    schedule: definition.schedule,
    thread: definition.thread,
    on: definition.enabled,
    next: definition.enabled && next?.revision === trigger.revision ? next.next : null,
    last: last ?? null,
  };
}

/** An occurrence as the contract tells it, from the input and the record of the task that follows it. */
function occurrenceView(input: OccurrenceInput, record: TaskRecord<JsonValue, JsonValue, JsonValue>): OccurrenceView {
  const { occurrence, unrun } = input;
  const ending = endedBy(record);
  return {
    id: occurrence.id,
    due: occurrence.due,
    firedAt: occurrence.firedAt,
    byHand: occurrence.byHand,
    ended: ending?.ended ?? unrun?.outcome ?? null,
    reason: ending?.reason ?? unrun?.reason ?? null,
  };
}

/** How the task of an occurrence ended, if it has ended. */
function endedBy(record: TaskRecord<JsonValue, JsonValue, JsonValue>): Ending | undefined {
  if (record.state.status !== "terminal") return undefined;
  const { outcome } = record.state;
  if ("result" in outcome && outcome.result !== undefined && outcome.result !== null) return outcome.result as Ending;
  if (outcome.status === "faulted" || outcome.status === "failed") return { ended: "failed", reason: outcome.error.message };
  if (outcome.status === "orphaned") return { ended: "failed", reason: outcome.reason };
  return { ended: "stopped" };
}
