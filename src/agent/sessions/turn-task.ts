import type { Context, JsonValue } from "@earendil-works/chord";
import {
  type ConversationHandle,
  type ConversationId,
  type Cursor,
  defineExtension,
  defineTask,
  type NextTaskState,
  type RunningTask,
  type SettledSubmissionRecord,
  type SubmissionRecord,
  type TaskOutcome,
  type TaskRecord,
  type TaskRuntime,
  type Tx,
} from "@earendil-works/pi-durable";
import { type Delivery, type Outstanding, promptFor, type Snapshot, type TurnOutcome } from "../intake/index.ts";
import { plain, RecordsDoc, ThreadsDoc } from "./documents.ts";
import { toOutcome } from "./turn.ts";

/** The name of the task that follows one event, from the moment it is taken up to its receipt. */
export const TURN_TASK = "shrimpy.turn";

/**
 * How many times the agent may end unexpectedly while an event's turn is
 * underway before the turn is given up. An event that reaches it is not followed
 * again: its turn is stopped, and chat is told it failed.
 */
export const MAX_CRASHES = 2;

/** What chat is told of an event that reached `MAX_CRASHES`. The words say "twice" for the count. */
const CRASHED_OUT: TurnOutcome = {
  kind: "failed",
  reason: "The agent stopped unexpectedly twice while working on this, so it gave up. Send it again to try once more.",
};

/** Where an event's task is: handing the event over, following its turn, or telling chat how the turn ended. */
export type TurnState = { phase: "handOver" } | { phase: "follow" } | { phase: "tell"; outcome: TurnOutcome };

/** The phase an event's task is in. A task that has ended is in none. */
export function phaseOf(record: TaskRecord<JsonValue, JsonValue, JsonValue>): TurnState["phase"] | undefined {
  return "checkpoint" in record.state ? (record.state.checkpoint as TurnState).phase : undefined;
}

type Runtime = TaskRuntime<Outstanding, TurnState, null, object>;
type Turn<P extends TurnState = TurnState> = RunningTask<Outstanding, P, null>;
type Phase<P extends TurnState = TurnState> = (turn: Turn<P>, runtime: Runtime, context: Context) => Promise<void>;
/** What a phase does when something unexpected went wrong in it, so that the task ends in a way that says so. */
type Recovery<P extends TurnState> = (turn: Turn<P>, runtime: Runtime, context: Context, failure: Error) => Promise<void>;

/** The input an event becomes is named for the event, so handing the same event over twice is one input. */
const requestIdOf = (eventId: string): string => `chat:${eventId}`;

const inputOf = (outstanding: Outstanding) => ({
  type: "input" as const,
  content: promptFor(outstanding),
  whenBusy: "followUp" as const,
  requestId: requestIdOf(outstanding.event.id),
});

export interface TurnTaskOptions {
  /** What tells chat how a turn ended. */
  delivery: Delivery;
  /** Told of a failure inside a task, which the task turns into a failed receipt. */
  onError(error: Error): void;
}

/**
 * The task that follows one event from the moment the agent takes it up to its
 * receipt. It belongs to the thread's session but not to the session's work: it
 * is a background task, so stopping the session's work leaves it to report how
 * that ended. Each phase is safe to run again after a crash, and none lets an
 * unexpected failure out, because a phase that throws ends its task for good,
 * with no receipt and nothing reported. The event gets a receipt in every case:
 * the way its turn ended, or that something went wrong. A turn that has been
 * interrupted by `MAX_CRASHES` unexpected ends of the agent is not run again:
 * the start that counted the last one stopped it, and the event is told it failed.
 */
export function turnTask(options: TurnTaskOptions) {
  const { delivery } = options;

  /** Run a phase so that nothing unexpected leaves it: report the failure, and let `recover` end the task. */
  const guarded =
    <P extends TurnState>(phase: Phase<P>, recover: Recovery<P>): Phase<P> =>
    async (turn, runtime, context) => {
      try {
        await phase(turn, runtime, context);
      } catch (error) {
        // The engine is closing, or the task was aborted: the engine ends the phase and carries on from the checkpoint.
        if (runtime.signal.aborted) throw error;
        const failure = asError(error);
        const where = `${turn.input.event.id} in thread ${turn.input.threadId}`;
        options.onError(new Error(`Work on ${where} failed: ${failure.message}`));
        await recover(turn, runtime, context, failure);
      }
    };

  /** The event is told the work failed, with the reason. */
  const tellFailed: Recovery<TurnState> = (_turn, runtime, context, failure) =>
    told(runtime, context, failedOutcome(failure));

  const task = defineTask<Outstanding, TurnState, null>({
    name: TURN_TASK,
    version: 1,
    initial: () => ({ phase: "handOver" }),
    phases: {
      // Hand the event over, after any earlier event of its thread that has not been.
      handOver: guarded(
        async (turn, runtime, context) => {
          const session = await sessionOf(turn.input, runtime, context);
          for (const input of [...(await unhanded(turn, runtime, context)), turn.input]) {
            await session.submit(inputOf(input), context);
          }
          await runtime.commit(() => ({ status: "running", checkpoint: { phase: "follow" } }), context);
        },
        tellFailed,
      ),

      // Wait for the input to settle, and keep how it ended.
      follow: guarded(
        async (turn, runtime, context) => {
          const session = await sessionOf(turn.input, runtime, context);
          const submission = await session.submit(inputOf(turn.input), context);
          // Nothing runs a waiting input once the session is idle, as when the turn ahead of it failed, even if the
          // agent restarted before it was taken back. Withdraw it, as a stop does, so it is skipped and shown with
          // the next one.
          await session.waitForIdle(context);
          if ((await submission.status(context)).status === "queued") await submission.abort(context);
          const outcome = await outcomeOf(await submission.wait(context), runtime, context);
          // An event that reached `MAX_CRASHES` had its turn stopped by the start that counted the crash, before the
          // turn could run again. It is told that it failed, and not that it was stopped.
          const crashedOut = (await crashesOf(turn.input, runtime, context)) >= MAX_CRASHES;
          await told(runtime, context, crashedOut ? CRASHED_OUT : outcome);
        },
        tellFailed,
      ),

      // Post the reply, leave the receipt, and keep a skipped event for the next turn in its thread.
      tell: guarded(
        async (turn, runtime, context) => {
          const { outcome } = turn.state.checkpoint;
          await delivery.tell(turn.input, outcome, runtime.signal);
          await runtime.commit((tx) => finish(tx, turn.input, outcome, { status: "completed", result: null }), context);
        },
        // Once more, to say that it failed; if that is what was being told, there is nothing left to try.
        (turn, runtime, context, failure) =>
          turn.state.checkpoint.outcome.kind === "failed"
            ? gaveUp(turn.input, runtime, context, failure)
            : tellFailed(turn, runtime, context, failure),
      ),
    },

    // Whoever aborts an event's task stops what the event is: its turn if one is running, its input if it waits.
    abort: async (turn, runtime, context) => {
      try {
        const { checkpoint } = turn.state;
        const outcome = checkpoint.phase === "tell" ? checkpoint.outcome : await stopped(turn, runtime, context);
        await delivery.tell(turn.input, outcome, runtime.signal);
        await runtime.commit((tx) => finish(tx, turn.input, outcome, { status: "aborted" }), context);
      } catch (error) {
        if (runtime.signal.aborted) throw error;
        const failure = asError(error);
        const where = `${turn.input.event.id} in thread ${turn.input.threadId}`;
        options.onError(new Error(`Stopping the work on ${where} failed: ${failure.message}`));
        await gaveUp(turn.input, runtime, context, failure);
      }
    },
  });

  return { task, extension: defineExtension({ name: "turns", tasks: [task] }) };
}

/** The task that follows an event, to create one in the commit that takes the event up. */
export type TurnTask = ReturnType<typeof turnTask>["task"];

async function sessionOf(input: Outstanding, runtime: Runtime, context: Context): Promise<ConversationHandle> {
  const session = await runtime.conversation(runtime.conversationId, context);
  if (session === undefined) throw new Error(`The session for thread ${input.threadId} is gone.`);
  return session;
}

/**
 * The events of this thread before the task's own whose tasks have not handed
 * them over yet, oldest first. A task hands these over before its own event.
 * Handing over is idempotent by the event's request ID, so it does not matter
 * which task gets there first, and no event can reach the session ahead of one
 * that precedes it in its thread, whatever order the engine starts the tasks in.
 */
async function unhanded(turn: Turn, runtime: Runtime, context: Context): Promise<Outstanding[]> {
  const found: Outstanding[] = [];
  await runtime.commit(async (tx) => {
    for (const record of await liveTurns(tx, runtime.conversationId)) {
      const input = record.input as Outstanding;
      if (phaseOf(record) === "handOver" && input.event.seq < turn.input.event.seq) found.push(input);
    }
    return undefined;
  }, context);
  return found.sort((a, b) => a.event.seq - b.event.seq);
}

/** The tasks that follow an event and are live, with none of them being aborted: those of one session, or of all. */
async function liveTurns(tx: Tx, conversationId?: ConversationId): Promise<TaskRecord<JsonValue, JsonValue, JsonValue>[]> {
  const found: TaskRecord<JsonValue, JsonValue, JsonValue>[] = [];
  for (const status of ["pending", "running"] as const) {
    let cursor: Cursor | undefined;
    do {
      const query = { ...(conversationId === undefined ? {} : { conversationId }), kind: TURN_TASK, status, abortRequested: false };
      const page = await tx.scanTasks(query, 100, cursor);
      found.push(...page.items);
      cursor = page.next;
    } while (cursor !== undefined);
  }
  return found;
}

/**
 * The events whose turn is underway: the task that follows the event is live
 * and its input is placed in the transcript and not settled. These are the turns
 * that a crash of the agent interrupts. An event whose turn has ended, so that
 * its task is telling chat, is not among them, and neither is one still waiting.
 */
export async function turnsUnderway(tx: Tx): Promise<{ eventId: string; conversationId: ConversationId }[]> {
  const underway: { eventId: string; conversationId: ConversationId }[] = [];
  for (const record of await liveTurns(tx)) {
    const eventId = (record.input as Outstanding).event.id;
    const submission = await tx.submissionByRequest(record.conversationId, requestIdOf(eventId));
    if (submission?.status === "placed") underway.push({ eventId, conversationId: record.conversationId });
  }
  return underway;
}

/** How many times the agent ended unexpectedly while the event's turn was underway. */
async function crashesOf(input: Outstanding, runtime: Runtime, context: Context): Promise<number> {
  return (await runtime.snapshot(RecordsDoc, context))?.crashes?.[input.event.id] ?? 0;
}

/** The event's task ends, so the count of its crashes is not needed any more. */
async function forgetCrashes(tx: Tx, input: Outstanding): Promise<void> {
  const records = await tx.doc(RecordsDoc);
  if (records.crashes?.[input.event.id] === undefined) return;
  records.crashes = Object.fromEntries(Object.entries(plain(records.crashes)).filter(([event]) => event !== input.event.id));
}

/** How a settled input ended, as the outcome of its event's turn. */
async function outcomeOf(settled: SettledSubmissionRecord, runtime: Runtime, context: Context): Promise<TurnOutcome> {
  const answer = settled.type === "input" && settled.status === "done" ? await runtime.entry(settled.answer, context) : undefined;
  return toOutcome(settled, answer);
}

/** The record of the input handed over for the event, if one was. */
async function handedOver(input: Outstanding, runtime: Runtime, context: Context): Promise<SubmissionRecord | undefined> {
  const found: { record?: SubmissionRecord } = {};
  await runtime.commit(async (tx) => {
    found.record = await tx.submissionByRequest(runtime.conversationId, requestIdOf(input.event.id));
    return undefined;
  }, context);
  return found.record;
}

/** Stop what an event is: withdraw its input if it waits, stop its turn if it runs, and say how that ended. */
async function stopped(turn: Turn, runtime: Runtime, context: Context): Promise<TurnOutcome> {
  if ((await handedOver(turn.input, runtime, context)) === undefined) return { kind: "skipped" };
  const session = await sessionOf(turn.input, runtime, context);
  const submission = await session.submit(inputOf(turn.input), context);
  const { status } = await submission.status(context);
  if (status === "queued") await submission.abort(context);
  else if (status === "placed") await session.abort(context);
  return outcomeOf(await submission.wait(context), runtime, context);
}

/** Go on to telling chat how the turn ended. */
function told(runtime: Runtime, context: Context, outcome: TurnOutcome): Promise<void> {
  return runtime.commit(() => ({ status: "running", checkpoint: { phase: "tell", outcome } }), context);
}

/** Nothing more can be done for the event: the task ends as failed, saying why. */
function gaveUp(input: Outstanding, runtime: Runtime, context: Context, failure: Error): Promise<void> {
  const error = { message: failure.message };
  return runtime.commit(async (tx) => {
    await forgetCrashes(tx, input);
    return { status: "terminal", outcome: { status: "failed", error } };
  }, context);
}

const failedOutcome = (failure: Error): TurnOutcome => ({
  kind: "failed",
  reason: `The agent hit an internal error: ${failure.message}`,
});

/** The event is done with: a skipped one is kept for the next turn in its thread, and the task ends. */
async function finish(
  tx: Tx,
  input: Outstanding,
  outcome: TurnOutcome,
  ended: TaskOutcome<null>,
): Promise<NextTaskState<TurnState, null>> {
  await forgetCrashes(tx, input);
  if (outcome.kind === "skipped") {
    const session = (await tx.doc(ThreadsDoc)).sessions[input.threadId];
    if (session !== undefined) session.unacted = inOrder([...plain(session.unacted), ...input.earlier, input.event]);
  }
  return { status: "terminal", outcome: ended };
}

/** Events by position in chat's order, each once. */
function inOrder(events: Snapshot[]): Snapshot[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));
