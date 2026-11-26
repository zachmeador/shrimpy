import type { ConversationId, Tx } from "@earendil-works/pi-durable";
import { type Check, describeSchedule, type Occurrence as OccurrenceView } from "../../contracts/agent/index.ts";
import type { TriggerDefinition } from "../../contracts/agent/node.ts";
import { newId } from "../../lib/ids/index.ts";
import { tasksOfKind } from "../host/durable.ts";
import {
  type Breadcrumb,
  isOccurrence,
  type Occurrence,
  type OccurrenceInput,
  type Outstanding,
  type Place,
} from "../inputs/index.ts";
import {
  copyOf,
  learnPlace,
  openSession,
  type SessionDefaults,
  type SessionRecord,
  SessionsDoc,
  type StoredTrigger,
  TriggersDoc,
} from "../records/durable.ts";
import { takeUp, TURN_TASK, type TurnTask } from "../turns/durable.ts";
import { interruptedWhile, notedIn } from "./check.durable.ts";

/** What was found out about the thread of a trigger that has no session behind it yet. */
export type Where = { thread: string } & ({ channelId: string; place?: Place } | { problem: string });

export interface Firing {
  due: number;
  firedAt: number;
  byHand: boolean;
  output?: string;
  id?: string;
}

export interface Finding {
  check: Check;
  output: string;
  news: boolean;
}

export type Unrun = NonNullable<OccurrenceInput["unrun"]>;

/** The conversation that owns the tasks that wait for standing triggers and unrun occurrences. */
export async function ownerOf(tx: Tx): Promise<ConversationId> {
  const doc = await tx.doc(TriggersDoc);
  if (doc.owner !== null) return doc.owner as ConversationId;
  const record = await tx.createConversation({ ownership: { kind: "ownerless" } });
  doc.owner = record.id;
  return record.id;
}

function occurrenceOf(definition: TriggerDefinition, firing: Firing): Occurrence {
  return {
    id: firing.id ?? newId("occ"),
    trigger: definition.name,
    due: firing.due,
    firedAt: firing.firedAt,
    byHand: firing.byHand,
    schedule: describeSchedule(definition.schedule),
    prompt: definition.prompt,
    ...(firing.output === undefined ? {} : { output: firing.output }),
  };
}

/** Put an occurrence on record as one that no turn runs, in the conversation that owns it. */
async function leave(tx: Tx, turn: TurnTask, occurrence: Occurrence, unrun: Unrun): Promise<OccurrenceView> {
  await takeUp(tx, turn, await ownerOf(tx), { occurrence, unrun }, []);
  return { id: occurrence.id, due: occurrence.due, firedAt: occurrence.firedAt, byHand: occurrence.byHand, ended: unrun.outcome, reason: unrun.reason };
}

function recordUnrun(tx: Tx, turn: TurnTask, definition: TriggerDefinition, firing: Firing, unrun: Unrun): Promise<OccurrenceView> {
  return leave(tx, turn, occurrenceOf(definition, firing), unrun);
}

/**
 * Make an occurrence of a waking standing trigger, in the commit `tx` belongs
 * to, and take it up in the session behind its thread.
 */
export async function fire(
  tx: Tx,
  parts: { turn: TurnTask; defaults: SessionDefaults; breadcrumbs: readonly Breadcrumb[] },
  definition: TriggerDefinition,
  firing: Firing,
  where?: Where,
): Promise<OccurrenceView> {
  const occurrence = occurrenceOf(definition, firing);
  if (definition.thread === null) {
    return leave(tx, parts.turn, occurrence, { outcome: "failed", reason: "The trigger has no thread to run in." });
  }
  const threadId = definition.thread;
  const sessions = (await tx.doc(SessionsDoc)).sessions;
  const session = Object.hasOwn(sessions, threadId) ? sessions[threadId] : undefined;

  const found = session === undefined && where?.thread === threadId ? where : undefined;
  let unrun: Unrun | undefined;
  if (session === undefined) {
    if (found === undefined) {
      unrun = { outcome: "failed", reason: "The trigger was changed while its occurrence was being made, so it did not run." };
    } else if ("problem" in found) {
      unrun = { outcome: "failed", reason: found.problem };
    }
  } else if (definition.overlap === "skip" && (await goingOn(tx, session, definition.name))) {
    unrun = { outcome: "skipped", reason: "The last occurrence was still going." };
  }

  if (unrun !== undefined) return leave(tx, parts.turn, occurrence, unrun);

  const channelId = session === undefined ? (found as { channelId: string }).channelId : session.channelId;
  const opened = await openSession(tx, parts.defaults, { threadId, channelId });
  if (found !== undefined && "place" in found && found.place !== undefined) learnPlace(opened, found.place);
  await takeUp(tx, parts.turn, opened.conversationId as ConversationId, { occurrence, threadId, channelId }, parts.breadcrumbs);
  return { id: occurrence.id, due: occurrence.due, firedAt: occurrence.firedAt, byHand: occurrence.byHand, ended: null, reason: null };
}

export async function settle(
  tx: Tx,
  parts: { turn: TurnTask; defaults: SessionDefaults; breadcrumbs: readonly Breadcrumb[] },
  trigger: StoredTrigger,
  finding: Finding,
  firing: Firing,
  where?: Where,
): Promise<void> {
  trigger.checkedAt = firing.firedAt;
  if (!finding.news) {
    trigger.quiet = (trigger.quiet ?? 0) + 1;
    return;
  }
  trigger.quiet = 0;
  const definition = copyOf(trigger.definition);
  const made =
    finding.check.then === "wake"
      ? await fire(tx, parts, definition, { ...firing, output: finding.output }, where)
      : await recordUnrun(tx, parts.turn, definition, firing, { outcome: "noted", reason: notedIn(definition.name) });
  if (made.ended === null || made.ended === "noted") trigger.last = finding.output;
}

export async function recordInterrupted(tx: Tx, turn: TurnTask, trigger: StoredTrigger, firing: Firing): Promise<void> {
  trigger.checkedAt = firing.firedAt;
  trigger.quiet = 0;
  await recordUnrun(tx, turn, copyOf(trigger.definition), firing, { outcome: "interrupted", reason: interruptedWhile(firing.byHand) });
}

async function goingOn(tx: Tx, session: SessionRecord, trigger: string): Promise<boolean> {
  const live = await tasksOfKind(tx, TURN_TASK, { conversationId: session.conversationId as ConversationId, live: true });
  return live.some((record) => {
    const input = record.input as Outstanding;
    return isOccurrence(input) && input.occurrence.trigger === trigger && input.unrun === undefined;
  });
}
