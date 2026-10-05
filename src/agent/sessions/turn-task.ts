import type { Context, JsonValue } from "@earendil-works/chord";
import { withCancel } from "@earendil-works/chord/context";
import {
  type ConversationHandle,
  type ConversationId,
  type Cursor,
  defineExtension,
  defineTask,
  type Harness,
  type NextTaskState,
  type RunningTask,
  type SettledSubmissionRecord,
  type Submission,
  type SubmissionRecord,
  type TaskOutcome,
  type TaskRecord,
  type TaskRuntime,
  type Tx,
} from "@earendil-works/pi-durable";
import {
  type Delivery,
  type Ending,
  endingOf,
  idOf,
  isChat,
  isOccurrence,
  isUrgent,
  isWakeup,
  type Outstanding,
  promptFor,
  threadOf,
  type TurnOutcome,
} from "../chat/index.ts";
import { plain, RecordsDoc, SessionsDoc, sessionAddress } from "./documents.ts";
import { keepSkipped } from "./kept.ts";
import { toOutcome } from "./turn.ts";

/** The name of the task that follows one input, from the moment it is taken up until its source is told how it ended. */
export const TURN_TASK = "shrimpy.turn";

/**
 * How many times the agent may end unexpectedly while an input's turn is
 * underway before the turn is given up. An input that reaches it is not followed
 * again: its turn is stopped, and its source is told it failed.
 */
export const MAX_CRASHES = 2;

/**
 * What the source of an input that reached `MAX_CRASHES` is told. The words say
 * "twice" for the count. A chat event can be sent again; a wake-up or an
 * occurrence is only reported, and the agent can ask for another wake-up while
 * a trigger comes again by itself.
 */
const abandonedOutcome = (input: Outstanding): TurnOutcome => ({
  kind: "failed",
  reason:
    "The agent stopped unexpectedly twice while working on this, so it gave up." +
    (isChat(input) ? " Send it again to try once more." : ""),
});

/** Where an input's task is: handing the input over, following its turn, or telling its source how the turn ended. */
export type TurnState = { phase: "handOver" } | { phase: "follow" } | { phase: "tell"; outcome: TurnOutcome };

/** The phase an input's task is in. A task that has ended is in none. */
export function phaseOf(record: TaskRecord<JsonValue, JsonValue, JsonValue>): TurnState["phase"] | undefined {
  return "checkpoint" in record.state ? (record.state.checkpoint as TurnState).phase : undefined;
}

type Runtime = TaskRuntime<Outstanding, TurnState, Ending, object>;
type Turn<P extends TurnState = TurnState> = RunningTask<Outstanding, P, Ending>;
type Phase<P extends TurnState = TurnState> = (turn: Turn<P>, runtime: Runtime, context: Context) => Promise<void>;
/** What a phase does when something unexpected went wrong in it, so that the task ends in a way that says so. */
type Recovery<P extends TurnState> = (turn: Turn<P>, runtime: Runtime, context: Context, failure: Error) => Promise<void>;

/**
 * The input a task hands its session is named for the input it follows, in the
 * namespace of its source, so handing the same one over twice is one input.
 */
const requestIdOf = (outstanding: Outstanding): string => {
  if (isWakeup(outstanding)) return `wake:${idOf(outstanding)}`;
  if (isOccurrence(outstanding)) return `trigger:${idOf(outstanding)}`;
  return `chat:${idOf(outstanding)}`;
};

/**
 * What the session is handed for an input. When the session is working, an
 * urgent input joins the turn that is running, which reads it at its next step,
 * and any other input waits for the next turn. A session that is idle starts a
 * turn for either.
 */
const inputOf = (outstanding: Outstanding) => ({
  type: "input" as const,
  content: promptFor(outstanding),
  whenBusy: isUrgent(outstanding) ? ("steer" as const) : ("followUp" as const),
  requestId: requestIdOf(outstanding),
});

/** Where an input is, as a report says it. */
function placeText(input: Outstanding): string {
  const thread = threadOf(input);
  if (thread !== undefined) return `in thread ${thread.threadId}`;
  if (isOccurrence(input)) return `of the trigger ${input.occurrence.trigger}`;
  return isWakeup(input) && input.trigger !== undefined ? `in the session of the trigger ${input.trigger}` : "in no thread";
}

export interface TurnTaskOptions {
  /** What tells an input's source how its turn ended. */
  delivery: Delivery;
  /** Told of a failure inside a task, which the task turns into the failure its source is told. */
  onError(error: Error): void;
}

/**
 * The task that follows one input, from any source, from the moment the agent
 * takes it up until its source is told how it ended. It does the same four
 * things whatever the source: it hands the input over to its session, after any
 * input admitted before it that has not been; waits for the turn to settle;
 * posts the turn's final text to the session's thread, if it is behind one; and
 * tells the source how the turn ended, which for a chat event is its receipt and
 * for an occurrence of a trigger is the outcome its task keeps. It belongs to
 * the session but not to the session's work: it is a background task, so
 * stopping the session's work leaves it to report how that ended. Each phase is
 * safe to run again after a crash, and none lets an unexpected failure out,
 * because a phase that throws ends its task for good, with nothing told and
 * nothing reported. The source is told in every case: the way the turn ended,
 * or that something went wrong. A turn that has been interrupted by
 * `MAX_CRASHES` unexpected ends of the agent is not run again: the start that
 * counted the last one stopped it, and the source is told it failed. An
 * occurrence that no turn ran, which comes with its outcome, goes straight to
 * telling it.
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
        const where = `${idOf(turn.input)} ${placeText(turn.input)}`;
        options.onError(new Error(`Work on ${where} failed: ${failure.message}`));
        await recover(turn, runtime, context, failure);
      }
    };

  /** The source is told the work failed, with the reason. */
  const tellFailed: Recovery<TurnState> = (_turn, runtime, context, failure) =>
    told(runtime, context, failedOutcome(failure));

  const task = defineTask<Outstanding, TurnState, Ending>({
    name: TURN_TASK,
    version: 1,
    initial: (input) => {
      const unrun = isOccurrence(input) ? input.unrun : undefined;
      if (unrun === undefined) return { phase: "handOver" };
      return { phase: "tell", outcome: unrun.outcome === "skipped" ? { kind: "skipped" } : { kind: "failed", reason: unrun.reason } };
    },
    phases: {
      // Hand the input over, after any input admitted before it that has not been.
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
          // The input ends with its own turn, whatever its session goes on to do. If the session goes idle first,
          // nothing runs the input, as when the turn ahead of it failed, even if the agent restarted before it was
          // taken back. Withdraw it, as a stop does, so it is skipped and shown with the next one.
          await endedOrIdle(submission, session, context);
          if ((await submission.status(context)).status === "queued") await submission.abort(context);
          const outcome = await outcomeOf(await submission.wait(context), runtime, context);
          // An input that reached `MAX_CRASHES` had its turn stopped by the start that counted the crash, before the
          // turn could run again. Its source is told that it failed, and not that it was stopped.
          const crashedOut = (await crashesOf(turn.input, runtime, context)) >= MAX_CRASHES;
          await told(runtime, context, crashedOut ? abandonedOutcome(turn.input) : outcome);
        },
        tellFailed,
      ),

      // Post the reply, tell the source how it ended, and keep a skipped input for the next one in its session.
      tell: guarded(
        async (turn, runtime, context) => {
          const { outcome } = turn.state.checkpoint;
          await delivery.tell(turn.input, outcome, runtime.signal);
          await runtime.commit((tx) => finish(tx, turn.input, outcome, "completed"), context);
        },
        // Once more, to say that it failed; if that is what was being told, there is nothing left to try.
        (turn, runtime, context, failure) =>
          turn.state.checkpoint.outcome.kind === "failed"
            ? gaveUp(turn.input, runtime, context, failure)
            : tellFailed(turn, runtime, context, failure),
      ),
    },

    // Whoever aborts an input's task stops what the input is: its turn if one is running, the input itself if it waits.
    abort: async (turn, runtime, context) => {
      try {
        const { checkpoint } = turn.state;
        const outcome = checkpoint.phase === "tell" ? checkpoint.outcome : await stopped(turn, runtime, context);
        await delivery.tell(turn.input, outcome, runtime.signal);
        await runtime.commit((tx) => finish(tx, turn.input, outcome, "aborted"), context);
      } catch (error) {
        if (runtime.signal.aborted) throw error;
        const failure = asError(error);
        const where = `${idOf(turn.input)} ${placeText(turn.input)}`;
        options.onError(new Error(`Stopping the work on ${where} failed: ${failure.message}`));
        await gaveUp(turn.input, runtime, context, failure);
      }
    },
  });

  return { task, extension: defineExtension({ name: "turns", tasks: [task] }) };
}

/** The task that follows an input, to create one in the commit that takes the input up. */
export type TurnTask = ReturnType<typeof turnTask>["task"];

/**
 * Take an input up: create the task that follows it, in the commit `tx` belongs
 * to, for the session `conversationId`. It is a background task, so a stop of
 * the session's work leaves it to report how that ended.
 */
export async function followInput(
  tx: Tx,
  turn: TurnTask,
  conversationId: ConversationId,
  input: Outstanding,
): Promise<void> {
  await tx.createTask(turn, input, { ownership: { kind: "conversation" }, conversationId, background: true });
}

async function sessionOf(input: Outstanding, runtime: Runtime, context: Context): Promise<ConversationHandle> {
  const session = await runtime.conversation(runtime.conversationId, context);
  if (session === undefined) throw new Error(`The session ${placeText(input)} is gone.`);
  return session;
}

/**
 * The inputs of this session admitted before the task's own whose tasks have not
 * handed them over yet, in the order they were admitted. A task hands these over
 * before its own input. An input is admitted in the commit that creates its
 * task, and the engine numbers what it creates in the order it creates it, so
 * the order of the tasks' IDs is the order of admission, whatever order the
 * engine starts the tasks in. Handing over is idempotent by the input's request
 * ID, so it does not matter which task gets there first, and no input can reach
 * the session ahead of one admitted before it. That is the order the session is
 * handed inputs in, urgent or not. It is not always the order the model reads
 * them in: an urgent input joins the turn that is running, ahead of earlier
 * inputs that wait for the next turn.
 */
async function unhanded(turn: Turn, runtime: Runtime, context: Context): Promise<Outstanding[]> {
  const found: TaskRecord<JsonValue, JsonValue, JsonValue>[] = [];
  await runtime.commit(async (tx) => {
    for (const record of await liveTurns(tx, runtime.conversationId)) {
      if (phaseOf(record) === "handOver" && record.id < turn.id) found.push(record);
    }
    return undefined;
  }, context);
  return found.sort((a, b) => a.id - b.id).map((record) => record.input as Outstanding);
}

/**
 * Take back the inputs of a session that no task has handed over yet: ones taken
 * up a moment ago, such as the events that come before a stop in one page of
 * chat's feed. Each such task is aborted, so its input does not reach the
 * session, and its source is told it was skipped, or stopped if it got there
 * meanwhile. An input that was handed over is the session's to withdraw or stop.
 */
export async function withdrawUnhanded(harness: Harness, conversationId: ConversationId, context: Context): Promise<void> {
  const { tasks } = await harness.inspect(context);
  for (const { record } of tasks) {
    if (record.kind !== TURN_TASK || record.conversationId !== conversationId || record.abortRequested) continue;
    if (phaseOf(record) === "handOver") await harness.abortTask(record.id, context);
  }
}

/** The tasks that follow an input and are live, with none of them being aborted: those of one session, or of all. */
export async function liveTurns(tx: Tx, conversationId?: ConversationId): Promise<TaskRecord<JsonValue, JsonValue, JsonValue>[]> {
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
 * The inputs whose turn is underway: the task that follows the input is live
 * and its input is placed in the transcript and not settled. These are the turns
 * that a crash of the agent interrupts. An input whose turn has ended, so that
 * its task is telling its source, is not among them, and neither is one still
 * waiting.
 */
export async function turnsUnderway(tx: Tx): Promise<{ inputId: string; conversationId: ConversationId }[]> {
  const underway: { inputId: string; conversationId: ConversationId }[] = [];
  for (const record of await liveTurns(tx)) {
    const input = record.input as Outstanding;
    const submission = await tx.submissionByRequest(record.conversationId, requestIdOf(input));
    if (submission?.status === "placed") underway.push({ inputId: idOf(input), conversationId: record.conversationId });
  }
  return underway;
}

/** How many times the agent ended unexpectedly while the input's turn was underway. */
async function crashesOf(input: Outstanding, runtime: Runtime, context: Context): Promise<number> {
  return (await runtime.snapshot(RecordsDoc, context))?.crashes?.[idOf(input)] ?? 0;
}

/** The input's task ends, so the count of its crashes is not needed any more. */
async function forgetCrashes(tx: Tx, input: Outstanding): Promise<void> {
  const records = await tx.doc(RecordsDoc);
  const id = idOf(input);
  if (records.crashes?.[id] === undefined) return;
  records.crashes = Object.fromEntries(Object.entries(plain(records.crashes)).filter(([counted]) => counted !== id));
}

/** How a settled input ended, as the outcome of its input's turn. */
async function outcomeOf(settled: SettledSubmissionRecord, runtime: Runtime, context: Context): Promise<TurnOutcome> {
  const answer = settled.type === "input" && settled.status === "done" ? await runtime.entry(settled.answer, context) : undefined;
  return toOutcome(settled, answer);
}

/**
 * Resolves when the input has ended or its session has gone idle, whichever
 * comes first. The wait that lost is cancelled, which touches neither the input
 * nor the session's work.
 */
async function endedOrIdle(submission: Submission, session: ConversationHandle, context: Context): Promise<void> {
  const watching = withCancel(context);
  const waits = [submission.wait(watching.context), session.waitForIdle(watching.context)].map((wait) => wait.then(() => undefined));
  try {
    await Promise.race(waits);
  } finally {
    watching.cancel();
    for (const wait of waits) wait.catch(() => undefined);
  }
}

/** The record of the input handed over to the session for the task's input, if one was. */
async function handedOver(input: Outstanding, runtime: Runtime, context: Context): Promise<SubmissionRecord | undefined> {
  const found: { record?: SubmissionRecord } = {};
  await runtime.commit(async (tx) => {
    found.record = await tx.submissionByRequest(runtime.conversationId, requestIdOf(input));
    return undefined;
  }, context);
  return found.record;
}

/** Stop what an input is: withdraw it if it waits, stop its turn if it runs, and say how that ended. */
async function stopped(turn: Turn, runtime: Runtime, context: Context): Promise<TurnOutcome> {
  if ((await handedOver(turn.input, runtime, context)) === undefined) return { kind: "skipped" };
  const session = await sessionOf(turn.input, runtime, context);
  const submission = await session.submit(inputOf(turn.input), context);
  const { status } = await submission.status(context);
  if (status === "queued") await submission.abort(context);
  else if (status === "placed") await session.abort(context);
  return outcomeOf(await submission.wait(context), runtime, context);
}

/** Go on to telling the source how the turn ended. */
function told(runtime: Runtime, context: Context, outcome: TurnOutcome): Promise<void> {
  return runtime.commit(() => ({ status: "running", checkpoint: { phase: "tell", outcome } }), context);
}

/** Nothing more can be done for the input: the task ends as failed, saying why. */
function gaveUp(input: Outstanding, runtime: Runtime, context: Context, failure: Error): Promise<void> {
  const error = { message: failure.message };
  return runtime.commit(async (tx) => {
    await forgetCrashes(tx, input);
    return { status: "terminal", outcome: { status: "failed", error, result: { ended: "failed", reason: failure.message } } };
  }, context);
}

const failedOutcome = (failure: Error): TurnOutcome => ({
  kind: "failed",
  reason: `The agent hit an internal error: ${failure.message}`,
});

/**
 * The input is done with: a skipped one is kept for the next input of its
 * session, and the task ends, keeping how the input ended in its record.
 */
async function finish(
  tx: Tx,
  input: Outstanding,
  outcome: TurnOutcome,
  how: "completed" | "aborted",
): Promise<NextTaskState<TurnState, Ending>> {
  await forgetCrashes(tx, input);
  const address = sessionAddress(input);
  if (outcome.kind === "skipped" && address !== undefined) {
    const sessions = (await tx.doc(SessionsDoc)).sessions;
    const session = Object.hasOwn(sessions, address) ? sessions[address] : undefined;
    if (session !== undefined) keepSkipped(session, input);
  }
  const result = endingOf(input, outcome);
  const ended: TaskOutcome<Ending> = how === "completed" ? { status: "completed", result } : { status: "aborted", result };
  return { status: "terminal", outcome: ended };
}

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));
