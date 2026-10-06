import type { ConversationId, Tx } from "@earendil-works/pi-durable";
import type { Occurrence as OccurrenceView } from "../../contracts/agent/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { describeSchedule, type TriggerDefinition } from "../home/index.ts";
import { type Breadcrumb, isOccurrence, type Occurrence, type OccurrenceInput, type Outstanding } from "../inputs/index.ts";
import {
  openSession,
  type SessionDefaults,
  type SessionRecord,
  SessionsDoc,
  triggerSession,
  TriggersDoc,
} from "../records/durable.ts";
import { liveTurns, takeUp, type TurnTask } from "../turns/durable.ts";

/** What was found out about the thread of a trigger that has no session behind it yet. */
export type Where = { thread: string } & ({ channelId: string } | { problem: string });

/**
 * What an occurrence needs to be made: when it was due and when it fired,
 * whether it was run by hand, and, for one that woke the agent because its check
 * found news, what the check printed.
 */
export interface Firing {
  due: number;
  firedAt: number;
  byHand: boolean;
  output?: string;
}

/** How an occurrence that no turn runs ended, and why. */
export type Unrun = NonNullable<OccurrenceInput["unrun"]>;

/** The conversation that owns the tasks that wait for triggers and the occurrences no session ran, made when it is first needed. */
export async function ownerOf(tx: Tx): Promise<ConversationId> {
  const doc = await tx.doc(TriggersDoc);
  if (doc.owner !== null) return doc.owner as ConversationId;
  const record = await tx.createConversation({ ownership: { kind: "ownerless" } });
  doc.owner = record.id;
  return record.id;
}

function occurrenceOf(definition: TriggerDefinition, firing: Firing): Occurrence {
  return {
    id: newId("occ"),
    trigger: definition.name,
    due: firing.due,
    firedAt: firing.firedAt,
    byHand: firing.byHand,
    schedule: describeSchedule(definition.schedule),
    prompt: definition.prompt,
    ...(firing.output === undefined ? {} : { output: firing.output }),
  };
}

/** Put an occurrence on record as one that no turn runs, in the conversation that owns it: its task ends at once with `unrun`. */
async function leave(tx: Tx, turn: TurnTask, occurrence: Occurrence, unrun: Unrun): Promise<OccurrenceView> {
  await takeUp(tx, turn, await ownerOf(tx), { occurrence, unrun }, []);
  return { id: occurrence.id, due: occurrence.due, firedAt: occurrence.firedAt, byHand: occurrence.byHand, ended: unrun.outcome, reason: unrun.reason };
}

/**
 * Put an occurrence on record that no turn is made for, in the commit `tx`
 * belongs to, with how it ended and why: its check found no news, or the agent
 * ended while its check ran. Nothing is taken from any session.
 */
export function recordUnrun(tx: Tx, turn: TurnTask, definition: TriggerDefinition, firing: Firing, unrun: Unrun): Promise<OccurrenceView> {
  return leave(tx, turn, occurrenceOf(definition, firing), unrun);
}

/**
 * Make an occurrence of a trigger, in the commit `tx` belongs to, and take it
 * up. It goes to the session behind the trigger's thread, or to the trigger's
 * own session, which this makes the first time. A thread with no session behind
 * it gets one made, in the channel `where` says it is in, which whoever calls
 * this found out from chat before the commit, and `breadcrumbs`, which are the
 * home's files, read before it too. If the trigger does not allow overlap and the
 * last occurrence is still going, or there is no channel to make the thread's
 * session in, the occurrence is made all the same, as one that no turn runs, so
 * that it is on record with its outcome and the reason.
 */
export async function fire(
  tx: Tx,
  parts: { turn: TurnTask; defaults: SessionDefaults; breadcrumbs: readonly Breadcrumb[] },
  definition: TriggerDefinition,
  firing: Firing,
  where?: Where,
): Promise<OccurrenceView> {
  const occurrence = occurrenceOf(definition, firing);
  const address = definition.thread ?? triggerSession(definition.name);
  const sessions = (await tx.doc(SessionsDoc)).sessions;
  const session = Object.hasOwn(sessions, address) ? sessions[address] : undefined;

  // What was found out about the thread's channel is only good for the thread it was found out for.
  const found = session === undefined && where?.thread === definition.thread ? where : undefined;
  let unrun: Unrun | undefined;
  if (definition.thread !== null && session === undefined) {
    if (found === undefined) {
      unrun = { outcome: "failed", reason: "The trigger was changed while its occurrence was being made, so it did not run." };
    } else if ("problem" in found) {
      unrun = { outcome: "failed", reason: found.problem };
    }
  } else if (session !== undefined && definition.overlap === "skip" && (await goingOn(tx, session, definition.name))) {
    unrun = { outcome: "skipped", reason: "The last occurrence was still going." };
  }

  if (unrun !== undefined) return leave(tx, parts.turn, occurrence, unrun);

  // The thread's channel, from the session that is there or from the one this makes; none for a session of the trigger's own.
  const channelId = session === undefined ? (found !== undefined && "channelId" in found ? found.channelId : null) : session.channelId;
  const thread = definition.thread !== null && channelId !== null ? { threadId: definition.thread, channelId } : undefined;
  const opened = await openSession(tx, parts.defaults, thread ?? { trigger: definition.name });
  const input = thread === undefined ? { occurrence } : { occurrence, ...thread };
  await takeUp(tx, parts.turn, opened.conversationId as ConversationId, input, parts.breadcrumbs);
  return { id: occurrence.id, due: occurrence.due, firedAt: occurrence.firedAt, byHand: occurrence.byHand, ended: null, reason: null };
}

/** Whether an occurrence of this trigger is still going in the session: its task is live and a turn was to run. */
async function goingOn(tx: Tx, session: SessionRecord, trigger: string): Promise<boolean> {
  return (await liveTurns(tx, session.conversationId as ConversationId)).some((record) => {
    const input = record.input as Outstanding;
    return isOccurrence(input) && input.occurrence.trigger === trigger && input.unrun === undefined;
  });
}
