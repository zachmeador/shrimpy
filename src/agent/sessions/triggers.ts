import type { JsonValue } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ConversationId,
  configure,
  type Cursor,
  defineExtension,
  defineTask,
  type Extension,
  type Harness,
  type TaskId,
  type TaskRecord,
  type Tx,
} from "@earendil-works/pi-durable";
import type { Occurrence as OccurrenceView, TriggerDetail, TriggerSummary } from "../../contracts/agent/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { localTime } from "../../lib/time/index.ts";
import {
  describeSchedule,
  type LeftOut,
  nextOccurrence,
  sameSchedule,
  type TriggerDefinition,
  type TriggerFiles,
  type TriggerProblem,
} from "../home/index.ts";
import { type Ending, isOccurrence, type Occurrence, type OccurrenceInput, type Outstanding } from "../intake/index.ts";
import { agentChange, type SessionDefaults } from "./defaults.ts";
import { plain, type SessionRecord, SessionsDoc, type StoredTrigger, triggerSession, TriggersDoc } from "./documents.ts";
import { carrying, takeCancelled } from "./kept.ts";
import { followInput, liveTurns, TURN_TASK, type TurnTask } from "./turn-task.ts";

/** The name of the task that sleeps until a trigger's next occurrence is due, and then makes it. */
const TRIGGER_TASK = "shrimpy.trigger";

/** How many of a trigger's most recent occurrences are told in its detail. */
const RECENT = 20;

/**
 * What the task for a trigger is made with: which trigger, the revision of its
 * schedule that it is for, and when its first occurrence is due. It keeps the
 * revision and the next time as it goes.
 */
type Waiting = { name: string; revision: number; next: number };
type Waits = { phase: "wait"; revision: number; next: number };

export interface TriggersOptions {
  /** The task that follows each occurrence, which is how an occurrence is taken up. */
  turn: TurnTask;
  /** What a session of a trigger's own is configured with when it is made. */
  defaults: SessionDefaults;
  /** Read the home's `triggers/` folder. */
  read(): Promise<TriggerFiles>;
  /**
   * Where the thread a trigger names is, for an occurrence that finds the agent
   * with no session behind it: the thread's channel, which only chat knows, or
   * why there is none to be had. It asks chat, so it is asked before the commit
   * that makes the occurrence and never inside it. Aborting `signal` gives up.
   */
  channelOf(threadId: string, signal: AbortSignal): Promise<{ channelId: string } | { problem: string }>;
  /** Told of an occurrence that could not be made. */
  onError(error: Error): void;
}

/** What was found out about the thread of a trigger that has no session behind it yet. */
type Where = { thread: string } & ({ channelId: string } | { problem: string });

/** The agent's standing triggers. */
export interface Triggers {
  readonly extension: Extension;
  /**
   * Read the home's trigger files and make the triggers follow them, which is
   * what the agent does when it starts and when it is told to reload. A file
   * that checks out is the trigger's definition from now on: a new schedule
   * counts from now, and a new prompt is used from the next occurrence. A file
   * that is gone, or that says `enabled: false`, ends the trigger. A file that
   * does not check out leaves the trigger as it was. Answers with how many
   * triggers the agent has now, on or off, and the files it left out, and why.
   */
  reload(): Promise<{ count: number; leftOut: LeftOut[] }>;
  /** Every trigger the agent has, in order of name. */
  list(): Promise<TriggerSummary[]>;
  /** One trigger with its definition and recent occurrences. Refused when there is none of that name. */
  show(name: string): Promise<TriggerDetail>;
  /** Fire a trigger once now, apart from its schedule. Refused when there is none of that name. */
  fire(name: string): Promise<OccurrenceView>;
}

const context = BACKGROUND_CONTEXT;

/**
 * The triggers an agent runs. A trigger and each of its occurrences are
 * separate tasks of the engine. The trigger's task is a background task of a
 * conversation of its own that sleeps on the engine's timer until the next
 * occurrence is due, and keeps the revision of the trigger's schedule that it is
 * for and that time. When it wakes it makes the occurrence and the next time in
 * one commit, so an occurrence happens once however often the agent is killed
 * meanwhile, and one that fell due while the agent was down happens once at the
 * next start: the next time counts from when it fired. An occurrence is an input
 * of a session, followed by the same task as any input, and that task's record
 * is the occurrence's record. A trigger with no thread has a session of its
 * own, made at its first occurrence; with a thread, its occurrences go to the
 * session behind that thread. If the agent has none, the occurrence asks chat
 * which channel the thread is in, before the commit that makes it, and makes
 * the session there. An occurrence that is skipped, or that has nowhere to go,
 * is still an occurrence: its task ends at once with that outcome. Nothing is
 * kept beside the engine's records but the last valid definition of each
 * trigger.
 */
export function createTriggers(harness: Harness, options: TriggersOptions): Triggers {
  const { turn, defaults } = options;

  /**
   * Where the thread the trigger names is, when it names one and the agent has no
   * session behind it. Nothing otherwise, and nothing is asked of chat.
   */
  async function whereTo(name: string, signal: AbortSignal): Promise<Where | undefined> {
    const thread = (await stored(name))?.definition.thread ?? null;
    if (thread === null) return undefined;
    const sessions = (await harness.snapshot(SessionsDoc, context))?.sessions ?? {};
    if (Object.hasOwn(sessions, thread)) return undefined;
    return { thread, ...(await options.channelOf(thread, signal)) };
  }

  const task = defineTask<Waiting, Waits, null>({
    name: TRIGGER_TASK,
    version: 1,
    initial: (input) => ({ phase: "wait", revision: input.revision, next: input.next }),
    phases: {
      wait: async (waiting, runtime, context) => {
        const { revision, next } = waiting.state.checkpoint;
        const { name } = waiting.input;
        await runtime.sleep(next, context);

        /** The trigger's next move at `now`: on to its next time, after making an occurrence if asked, or to its end. */
        const carryOn = async (tx: Tx, occurrence: boolean, where?: Where) => {
          const stored = (await tx.doc(TriggersDoc)).triggers;
          const found = Object.hasOwn(stored, name) ? stored[name] : undefined;
          // Not the trigger this task is for any more: its file changed its schedule, turned it off or is gone.
          if (found === undefined || !found.definition.enabled || found.revision !== revision) {
            return { status: "terminal", outcome: { status: "completed", result: null } } as const;
          }
          const now = runtime.now();
          if (occurrence) {
            await fire(tx, { turn, defaults }, plain(found.definition), { due: next, firedAt: now, byHand: false }, where);
          }
          return { status: "running", checkpoint: { phase: "wait", revision, next: nextOccurrence(found.definition.schedule, now) } } as const;
        };

        try {
          // Asking chat where the thread is comes first, and takes no part in the commit that makes the occurrence.
          const where = await whereTo(name, runtime.signal);
          await runtime.commit((tx) => carryOn(tx, true, where), context);
        } catch (error) {
          // The engine is closing, or the task was aborted: the engine ends the phase and carries on from the checkpoint.
          if (runtime.signal.aborted) throw error;
          const message = error instanceof Error ? error.message : String(error);
          // This occurrence could not be made. The trigger goes on to its next time, so that one failure does not end it.
          // A task being aborted refuses this too, and then nothing went wrong that needs reporting.
          await runtime.commit((tx) => carryOn(tx, false), context);
          options.onError(new Error(`The trigger ${name} could not make its occurrence for ${localTime(next)}: ${message}`));
        }
      },
    },

    abort: async (_waiting, runtime, context) => {
      await runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context);
    },
  });

  /** Reloading twice at once would reconcile twice, and the later reading may be the older. */
  let queue: Promise<unknown> = Promise.resolve();

  async function reconcile(files: TriggerFiles): Promise<{ count: number; leftOut: LeftOut[] }> {
    const now = Date.now();
    const result = await harness.commit(async (tx) => {
      const live = await liveTriggerTasks(tx);
      const doc = await tx.doc(TriggersDoc);
      const before = plain(doc.triggers);
      const after: Record<string, StoredTrigger> = {};
      const leftOut: LeftOut[] = [];

      // A schedule that is new gets a revision no other has had, so a task for the schedule before it, or for a trigger
      // of the same name that went away, is never taken for this one.
      let revisions = doc.revisions;
      for (const definition of files.triggers) {
        const old = Object.hasOwn(before, definition.name) ? before[definition.name] : undefined;
        const unchanged = old !== undefined && sameSchedule(old.definition.schedule, definition.schedule);
        after[definition.name] = { revision: unchanged ? old.revision : (revisions += 1), definition };
      }
      for (const problem of files.problems) {
        const old = keptFor(problem, before, after);
        if (old !== undefined && problem.name !== null) after[problem.name] = old;
        leftOut.push({
          file: problem.file,
          reason: old === undefined ? problem.reason : `${problem.reason}, so the trigger keeps its last valid definition`,
        });
      }

      // A trigger has one task for its schedule as it is: one that is for another revision, or for a trigger that is off
      // or gone, is ended at once, and a trigger that is on and has none gets one.
      const abort: TaskId[] = [];
      const create: Waiting[] = [];
      for (const [name, stored] of Object.entries(after)) {
        const mine = live.filter((each) => each.name === name);
        const current = stored.definition.enabled ? mine.find((each) => each.revision === stored.revision) : undefined;
        abort.push(...mine.filter((each) => each !== current).map((each) => each.id));
        if (stored.definition.enabled && current === undefined) {
          try {
            create.push({ name, revision: stored.revision, next: nextOccurrence(stored.definition.schedule, now) });
          } catch (error) {
            leftOut.push({ file: `triggers/${name}.md`, reason: `it is not a schedule that comes: ${error instanceof Error ? error.message : String(error)}` });
          }
        }
      }

      abort.push(...live.filter((each) => !Object.hasOwn(after, each.name)).map((each) => each.id));

      if (JSON.stringify(before) !== JSON.stringify(after)) doc.triggers = after;
      if (revisions !== doc.revisions) doc.revisions = revisions;
      if (create.length > 0) {
        const owner = await ownerOf(tx);
        for (const waiting of create) {
          await tx.createTask(task, waiting, { ownership: { kind: "conversation" }, conversationId: owner, background: true });
        }
      }
      return { abort, leftOut, count: Object.keys(after).length };
    }, context);
    for (const id of result.abort) await harness.abortTask(id, context);
    return { count: result.count, leftOut: result.leftOut };
  }

  /** The tasks that wait for a trigger and are not being ended, with what they are for. */
  async function liveTriggerTasks(tx: Tx): Promise<{ id: TaskId; name: string; revision: number }[]> {
    const found: { id: TaskId; name: string; revision: number }[] = [];
    for (const status of ["pending", "running"] as const) {
      let cursor: Cursor | undefined;
      do {
        const page = await tx.scanTasks({ kind: TRIGGER_TASK, status, abortRequested: false }, 100, cursor);
        for (const record of page.items) {
          if ("checkpoint" in record.state) {
            const state = record.state.checkpoint as Waits;
            found.push({ id: record.id, name: (record.input as Waiting).name, revision: state.revision });
          }
        }
        cursor = page.next;
      } while (cursor !== undefined);
    }
    return found;
  }

  /** The stored trigger of this name, if the agent has one. */
  async function stored(name: string): Promise<StoredTrigger | undefined> {
    const triggers = (await harness.snapshot(TriggersDoc, context))?.triggers ?? {};
    return Object.hasOwn(triggers, name) ? triggers[name] : undefined;
  }

  /** When each trigger that is on is next due, from the tasks that wait for them. */
  async function nextTimes(): Promise<Map<string, { revision: number; next: number }>> {
    const { tasks } = await harness.inspect(context);
    const times = new Map<string, { revision: number; next: number }>();
    for (const { record } of tasks) {
      if (record.kind !== TRIGGER_TASK || record.abortRequested || !("checkpoint" in record.state)) continue;
      const { revision, next } = record.state.checkpoint as Waits;
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
  async function occurrences(): Promise<{ trigger: string; view: OccurrenceView }[]> {
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

  function summaryOf(trigger: StoredTrigger, next: { revision: number; next: number } | undefined, last: OccurrenceView | undefined): TriggerSummary {
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

  return {
    extension: defineExtension({ name: "triggers", tasks: [task] }),

    reload() {
      const reloaded = queue.then(async () => reconcile(await options.read()));
      queue = reloaded.catch(() => undefined);
      return reloaded;
    },

    async list() {
      const triggers = (await harness.snapshot(TriggersDoc, context))?.triggers ?? {};
      const times = await nextTimes();
      const last = new Map<string, OccurrenceView>();
      for (const { trigger, view } of await occurrences()) last.set(trigger, view);
      return Object.keys(triggers)
        .sort(byName)
        .map((name) => summaryOf(triggers[name]!, times.get(name), last.get(name)));
    },

    async show(name) {
      const found = await stored(name);
      if (found === undefined) refuse(noTrigger(name));
      const recent = (await occurrences()).filter(({ trigger }) => trigger === name).map(({ view }) => view);
      const { definition } = found;
      return {
        ...summaryOf(found, (await nextTimes()).get(name), recent.at(-1)),
        prompt: definition.prompt,
        overlap: definition.overlap,
        session: definition.thread === null ? triggerSession(name) : null,
        occurrences: recent.slice(-RECENT).reverse(),
      };
    },

    async fire(name) {
      const where = await whereTo(name, new AbortController().signal);
      return harness.commit(async (tx) => {
        const triggers = (await tx.doc(TriggersDoc)).triggers;
        const found = Object.hasOwn(triggers, name) ? triggers[name] : undefined;
        if (found === undefined) refuse(noTrigger(name));
        const now = Date.now();
        return fire(tx, { turn, defaults }, plain(found.definition), { due: now, firedAt: now, byHand: true }, where);
      }, context);
    },
  };
}

const noTrigger = (name: string): string => `This agent has no trigger called ${name}.`;

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The definition a trigger keeps when its file does not check out: the one it
 * had before, if it had one and no valid file has taken its place.
 */
function keptFor(
  problem: TriggerProblem,
  before: Record<string, StoredTrigger>,
  after: Record<string, StoredTrigger>,
): StoredTrigger | undefined {
  if (problem.name === null || Object.hasOwn(after, problem.name) || !Object.hasOwn(before, problem.name)) return undefined;
  return before[problem.name];
}

/** The conversation that owns the tasks that wait for triggers and the occurrences no session ran, made when it is first needed. */
async function ownerOf(tx: Tx): Promise<ConversationId> {
  const doc = await tx.doc(TriggersDoc);
  if (doc.owner !== null) return doc.owner as ConversationId;
  const record = await tx.createConversation({ ownership: { kind: "ownerless" } });
  doc.owner = record.id;
  return record.id;
}

/** What an occurrence needs to be made: when it was due and when it fired, and whether it was run by hand. */
interface Firing {
  due: number;
  firedAt: number;
  byHand: boolean;
}

/**
 * Make an occurrence of a trigger, in the commit `tx` belongs to, and take it
 * up. It goes to the session behind the trigger's thread, or to the trigger's
 * own session, which this makes the first time. A thread with no session behind
 * it gets one made, in the channel `where` says it is in, which whoever calls
 * this found out from chat before the commit. If the trigger does not allow
 * overlap and the last occurrence is still going, or there is no channel to make
 * the thread's session in, the occurrence is made all the same, as one that no
 * turn runs, so that it is on record with its outcome and the reason.
 */
async function fire(
  tx: Tx,
  parts: { turn: TurnTask; defaults: SessionDefaults },
  definition: TriggerDefinition,
  firing: Firing,
  where?: Where,
): Promise<OccurrenceView> {
  const occurrence: Occurrence = {
    id: newId("occ"),
    trigger: definition.name,
    due: firing.due,
    firedAt: firing.firedAt,
    byHand: firing.byHand,
    schedule: describeSchedule(definition.schedule),
    prompt: definition.prompt,
  };
  const address = definition.thread ?? triggerSession(definition.name);
  const sessions = (await tx.doc(SessionsDoc)).sessions;
  const session = Object.hasOwn(sessions, address) ? sessions[address] : undefined;

  // What was found out about the thread's channel is only good for the thread it was found out for.
  const found = session === undefined && where?.thread === definition.thread ? where : undefined;
  let unrun: { outcome: "skipped" | "failed"; reason: string } | undefined;
  if (definition.thread !== null && session === undefined) {
    if (found === undefined) {
      unrun = { outcome: "failed", reason: "The trigger was changed while its occurrence was being made, so it did not run." };
    } else if ("problem" in found) {
      unrun = { outcome: "failed", reason: found.problem };
    }
  } else if (session !== undefined && definition.overlap === "skip" && (await goingOn(tx, session, definition.name))) {
    unrun = { outcome: "skipped", reason: "The last occurrence was still going." };
  }

  if (unrun !== undefined) {
    await followInput(tx, parts.turn, await ownerOf(tx), { occurrence, unrun });
    return { id: occurrence.id, due: occurrence.due, firedAt: occurrence.firedAt, byHand: occurrence.byHand, ended: unrun.outcome, reason: unrun.reason };
  }

  // The thread's channel, from the session that is there or from the one this makes; none for a session of the trigger's own.
  let channelId: string | null = session?.channelId ?? null;
  let conversationId: ConversationId;
  let cancelled: ReturnType<typeof takeCancelled> = [];
  if (session === undefined) {
    conversationId = (await tx.createConversation({ ownership: { kind: "ownerless" } })).id;
    await configure(tx, conversationId, agentChange(parts.defaults));
    if (found !== undefined && "channelId" in found) {
      channelId = found.channelId;
      sessions[address] = { conversationId, channelId, unacted: [] };
    } else {
      sessions[address] = { conversationId, channelId: null, trigger: definition.name, unacted: [] };
    }
  } else {
    conversationId = session.conversationId as ConversationId;
    cancelled = takeCancelled(session);
  }
  const thread = definition.thread !== null && channelId !== null ? { threadId: definition.thread, channelId } : undefined;
  const input: OccurrenceInput =
    thread === undefined ? { occurrence, ...carrying(cancelled) } : { occurrence, ...thread, ...carrying(cancelled) };
  await followInput(tx, parts.turn, conversationId, input);
  return { id: occurrence.id, due: occurrence.due, firedAt: occurrence.firedAt, byHand: occurrence.byHand, ended: null, reason: null };
}

/** Whether an occurrence of this trigger is still going in the session: its task is live and a turn was to run. */
async function goingOn(tx: Tx, session: SessionRecord, trigger: string): Promise<boolean> {
  return (await liveTurns(tx, session.conversationId as ConversationId)).some((record) => {
    const input = record.input as Outstanding;
    return isOccurrence(input) && input.occurrence.trigger === trigger && input.unrun === undefined;
  });
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
