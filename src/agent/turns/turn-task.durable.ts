import type { JsonValue } from "@earendil-works/chord/json";
import type { Context } from "@earendil-works/chord/context";
import {
  type ConversationHandle,
  type ConversationId,
  defineExtension,
  defineTask,
  type Harness,
  LiveDoc,
  type NextTaskState,
  type RunningTask,
  type SettledSubmissionRecord,
  type SubmissionRecord,
  type TaskId,
  type TaskOutcome,
  type TaskRecord,
  type TaskRuntime,
  type Tx,
} from "@earendil-works/pi-durable";
import { failureWords } from "../../contracts/agent/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { pause } from "../../lib/retry/index.ts";
import {
  endingOf,
  type Ending,
  idOf,
  isOccurrence,
  isProcess,
  isUrgent,
  isWatch,
  type ModelChange,
  type Outstanding,
  promptFor,
  threadOf,
  type TurnOutcome,
} from "../inputs/index.ts";
import { ABORTED, tasksOfKind } from "../host/durable.ts";
import { keepSkipped, sessionAddress, SessionsDoc } from "../records/durable.ts";
import { chatPause, type Delivery } from "./delivery.ts";
import { modelChangeOf } from "./model-change.durable.ts";
import { CUT_OFF, toOutcome } from "./turn.durable.ts";

/** The name of the task that follows one input, from the moment it is taken up until its source is told how it ended. */
export const TURN_TASK = "shrimpy.turn";

/** The name of the task that waits for an input's turn to end, for the task that follows the input. */
const WAIT_TASK = "shrimpy.turn-wait";

/**
 * Where an input's task is: handing the input over, following its turn, which
 * it does by waiting on the task `wait` that waits for the turn to end, or
 * telling its source how the turn ended, after `tries` tries that chat was away for.
 */
export type TurnState =
  | { phase: "handOver" }
  | { phase: "follow"; wait: number }
  | { phase: "tell"; outcome: TurnOutcome; tries?: number };

/** The phase an input's task is in. A task that has ended is in none. */
export function phaseOf(record: TaskRecord<JsonValue, JsonValue, JsonValue>): TurnState["phase"] | undefined {
  return "checkpoint" in record.state ? (record.state.checkpoint as TurnState).phase : undefined;
}

type Runtime = TaskRuntime<Outstanding, TurnState, Ending, object>;
/** What reading how an input ended takes of a task's runtime: the input's task's, or its wait's. */
type Reader = Pick<Runtime, "conversationId" | "entry" | "snapshot">;
type Turn<P extends TurnState = TurnState> = RunningTask<Outstanding, P, Ending>;
type Phase<P extends TurnState = TurnState> = (turn: Turn<P>, runtime: Runtime, context: Context) => Promise<void>;
/** What a phase does when something unexpected went wrong in it, so that the task ends in a way that says so. */
type Recovery<P extends TurnState> = (turn: Turn<P>, runtime: Runtime, context: Context, failure: Error) => Promise<void>;

/**
 * The input a task hands its session is named for the input it follows, in the
 * namespace of its source, so handing the same one over twice is one input.
 */
const requestIdOf = (outstanding: Outstanding): string => {
  if (isOccurrence(outstanding)) return `trigger:${idOf(outstanding)}`;
  if (isProcess(outstanding)) return `process:${idOf(outstanding)}`;
  if (isWatch(outstanding)) return `watch:${idOf(outstanding)}`;
  return `chat:${idOf(outstanding)}`;
};

/**
 * What the session is handed for an input. When the session is working, an
 * urgent input joins the turn that is running, which reads it at its next step,
 * and any other input waits for the next turn. A session that is idle starts a
 * turn for either. `change` is the fact that the session's model is not the one
 * that wrote its last answer, which is shown with the first input it is handed
 * after that. Only the submission that first names a request ID says anything,
 * so whoever asks for it again to find it leaves `change` out.
 */
const inputOf = (outstanding: Outstanding, change?: ModelChange) => ({
  type: "input" as const,
  content: promptFor(outstanding, change),
  whenBusy: isUrgent(outstanding) ? ("steer" as const) : ("followUp" as const),
  requestId: requestIdOf(outstanding),
});

/** Where an input is, as a report says it. */
function placeText(input: Outstanding): string {
  const thread = threadOf(input);
  if (thread !== undefined) return `in thread ${thread.threadId}`;
  if (isOccurrence(input)) return `of the trigger ${input.occurrence.trigger ?? "one-time"}`;
  return "in no thread";
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
 * or that something went wrong. An occurrence that no turn ran, which comes with
 * its outcome, goes straight to telling it.
 *
 * The engine ends a task that unexpected ends of the agent cut off five times
 * in a row without progress, its default, and that breaks every crash loop.
 * While the input waits for its turn to end, the task waits on a task of its
 * own that does, which is the one the engine counts. When the engine ends that
 * one, a turn of the input's that still runs is stopped and its source is told
 * it failed, saying why; an input still waiting is taken back and skipped; and
 * one whose turn ended meanwhile is told as it ended. A task that is cut off
 * that often while it hands the input over or tells its source is ended itself,
 * and nothing is told. While chat is away the task sleeps between tries at
 * telling, which holds nothing, so a crash then cuts nothing off.
 */
export function turnTask(options: TurnTaskOptions) {
  const { delivery } = options;

  /**
   * The task that waits for an input's turn to end and says how it ended. It
   * holds the wait in memory, so the engine counts it each time the agent ends
   * unexpectedly while the turn runs, and ends it at its limit. That count also
   * says whether the turn an answer ends was cut short: it was if the agent
   * ended uncleanly while the input was being answered, and not if the input was
   * only waiting for its turn. Whatever goes wrong in it is the task that follows
   * the input's to tell.
   */
  const wait = defineTask<Outstanding, { phase: "wait" }, TurnOutcome>({
    name: WAIT_TASK,
    version: 1,
    initial: () => ({ phase: "wait" }),
    phases: {
      wait: async (waiting, runtime, context) => {
        const session = await sessionOf(waiting.input, runtime, context);
        const submission = await session.submit(inputOf(waiting.input), context);
        const cut = (waiting.restarts ?? 0) > 0 && (await submission.status(context)).status === "placed";
        const outcome = await outcomeOf(await submission.wait(context), runtime, context);
        const result: TurnOutcome = cut && outcome.kind === "answered" ? { ...outcome, cut: true } : outcome;
        await runtime.commit(() => ({ status: "terminal", outcome: { status: "completed", result } }), context);
      },
    },
    abort: (_waiting, runtime, context) => runtime.commit(() => ABORTED, context),
  });

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
    version: 2,
    initial: (input) => {
      const unrun = isOccurrence(input) ? input.unrun : undefined;
      if (unrun === undefined) return { phase: "handOver" };
      // An occurrence no turn ran has nobody to tell, unless something went wrong: then it is told as a failure, which reports it.
      const wrong = unrun.outcome === "failed" || unrun.outcome === "interrupted";
      return { phase: "tell", outcome: wrong ? { kind: "failed", reason: unrun.reason } : { kind: "skipped" } };
    },
    phases: {
      // Hand the input over, after any input admitted before it that has not been, and wait on a task that waits for its turn.
      handOver: guarded(
        async (turn, runtime, context) => {
          // An occurrence's line goes up before its turn starts, if chat is there; if not, it goes above the reply.
          await delivery.announce(turn.input, runtime.signal);
          const session = await sessionOf(turn.input, runtime, context);
          // The session is told of a change of its model once, with the first input it is handed.
          const change = await modelChange(runtime, context);
          const inputs = [...(await unhanded(turn, runtime, context)), turn.input];
          for (const [index, input] of inputs.entries()) {
            await session.submit(inputOf(input, index === 0 ? change : undefined), context);
          }
          await runtime.commit(async (tx) => {
            const waiting = await tx.createTask(wait, turn.input, { ownership: { kind: "task", taskId: runtime.taskId } });
            return { status: "waiting", on: [waiting], policy: "allSettled", checkpoint: { phase: "follow", wait: Number(waiting) } };
          }, context);
        },
        tellFailed,
      ),

      // The turn has ended, or the engine ended the wait for it: keep how it ended.
      follow: guarded<Extract<TurnState, { phase: "follow" }>>(
        async (turn, runtime, context) => {
          const [ended] = await runtime.outcomes([turn.state.checkpoint.wait as TaskId<TurnOutcome>], context);
          if (ended?.status === "completed") return told(runtime, context, ended.result);
          // The agent ended unexpectedly too often while the input waited. If its turn still runs, that is the work the
          // agent may keep ending in, so it stops, and fails saying why.
          if (ended?.status === "faulted" && cutOff(ended.error.detail)) {
            return told(runtime, context, await stopped(turn, runtime, context, { kind: "failed", reason: CUT_OFF }));
          }
          throw new Error(errorOf(ended));
        },
        tellFailed,
      ),

      // Post the reply, tell the source how it ended, and keep a skipped input for the next one in its session.
      tell: guarded<Extract<TurnState, { phase: "tell" }>>(
        async (turn, runtime, context) => {
          const { outcome, tries = 0 } = turn.state.checkpoint;
          if ((await delivery.tell(turn.input, outcome, runtime.signal)) === "later") {
            await runtime.sleepUntil(runtime.now() + chatPause(tries), { phase: "tell", outcome, tries: tries + 1 }, context);
            return;
          }
          await runtime.commit((tx) => finish(tx, turn.input, outcome, "completed"), context);
        },
        // Once more, to say that it failed; if that is what was being told, there is nothing left to try.
        (turn, runtime, context, failure) =>
          turn.state.checkpoint.outcome.kind === "failed"
            ? gaveUp(runtime, context, failure)
            : tellFailed(turn, runtime, context, failure),
      ),
    },

    // Whoever aborts an input's task stops what the input is: its turn if one is running, the input itself if it waits.
    abort: async (turn, runtime, context) => {
      try {
        const { checkpoint } = turn.state;
        const outcome = checkpoint.phase === "tell" ? checkpoint.outcome : await stopped(turn, runtime, context);
        // A stop ends its task, so it has no sleep to wait for chat in: it waits here.
        for (let tries = 0; (await delivery.tell(turn.input, outcome, runtime.signal)) === "later"; tries += 1) {
          await pause(chatPause(tries), runtime.signal);
        }
        await runtime.commit((tx) => finish(tx, turn.input, outcome, "aborted"), context);
      } catch (error) {
        if (runtime.signal.aborted) throw error;
        const failure = asError(error);
        const where = `${idOf(turn.input)} ${placeText(turn.input)}`;
        options.onError(new Error(`Stopping the work on ${where} failed: ${failure.message}`));
        await gaveUp(runtime, context, failure);
      }
    },
  });

  return { task, extension: defineExtension({ name: "turns", tasks: [task, wait] }) };
}

/** The task that follows an input, to create one in the commit that takes the input up. */
export type TurnTask = ReturnType<typeof turnTask>["task"];

async function sessionOf(input: Outstanding, runtime: Pick<Runtime, "conversation" | "conversationId">, context: Context): Promise<ConversationHandle> {
  const session = await runtime.conversation(runtime.conversationId, context);
  if (session === undefined) throw new Error(`The session ${placeText(input)} is gone.`);
  return session;
}

/** That the session's model is not the one that wrote its last answer, if so, as it stands as the input is handed over. */
async function modelChange(runtime: Runtime, context: Context): Promise<ModelChange | undefined> {
  const found: { change?: ModelChange } = {};
  await runtime.commit(async (tx) => {
    found.change = await modelChangeOf(tx, runtime.conversationId);
    return undefined;
  }, context);
  return found.change;
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
    for (const record of await tasksOfKind(tx, TURN_TASK, { conversationId: runtime.conversationId, live: true })) {
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

/**
 * How a settled input ended, as the outcome of its input's turn. The engine
 * takes back the inputs behind a turn that fails, and the session says why that
 * turn failed until its next turn starts, which is read at once.
 */
async function outcomeOf(settled: SettledSubmissionRecord, runtime: Reader, context: Context): Promise<TurnOutcome> {
  if (settled.type === "input" && settled.status === "done") return toOutcome(settled, await runtime.entry(settled.answer, context));
  if (settled.status === "unanswered" && settled.reason === "run_failed") {
    return toOutcome(settled, undefined, (await runtime.snapshot(LiveDoc, runtime.conversationId, context))?.runFailure);
  }
  return toOutcome(settled, undefined);
}

/** Whether a task ended because the agent's unexpected ends cut it off as often as the engine allows. */
function cutOff(detail: JsonValue | undefined): boolean {
  return typeof detail === "object" && detail !== null && !Array.isArray(detail) && detail.reason === "restart_limit";
}

/** What went wrong in the wait for a turn that ended without saying how the turn ended. */
function errorOf(ended: TaskOutcome<unknown> | undefined): string {
  if (ended === undefined) return "The wait for its turn left no outcome.";
  if (ended.status === "failed" || ended.status === "faulted") return ended.error.message;
  return `The wait for its turn ended ${ended.status}${ended.reason === undefined ? "" : `: ${ended.reason}`}.`;
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

/**
 * Stop what an input is: withdraw it if it waits, stop its turn if it runs, and
 * say how that ended. A turn that was running is told `instead`, when given, in
 * place of having been stopped.
 */
async function stopped(turn: Turn, runtime: Runtime, context: Context, instead?: TurnOutcome): Promise<TurnOutcome> {
  if ((await handedOver(turn.input, runtime, context)) === undefined) return { kind: "skipped" };
  const session = await sessionOf(turn.input, runtime, context);
  const submission = await session.submit(inputOf(turn.input), context);
  const { status } = await submission.status(context);
  if (status === "queued") await submission.abort(context);
  else if (status === "placed") await session.abort(context);
  const outcome = await outcomeOf(await submission.wait(context), runtime, context);
  return status === "placed" && instead !== undefined ? instead : outcome;
}

/** Go on to telling the source how the turn ended. */
function told(runtime: Runtime, context: Context, outcome: TurnOutcome): Promise<void> {
  return runtime.commit(() => ({ status: "running", checkpoint: { phase: "tell", outcome } }), context);
}

/** Nothing more can be done for the input: the task ends as failed, saying why. */
function gaveUp(runtime: Runtime, context: Context, failure: Error): Promise<void> {
  const error = { message: failure.message };
  return runtime.commit(
    () => ({ status: "terminal", outcome: { status: "failed", error, result: { ended: "failed", reason: failure.message } } }),
    context,
  );
}

const failedOutcome = (failure: Error): TurnOutcome => ({ kind: "failed", reason: failureWords("internal_error", failure.message) });

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
