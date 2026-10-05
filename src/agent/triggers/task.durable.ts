import type { Context } from "@earendil-works/chord";
import { defineTask, type TaskRuntime, type Tx } from "@earendil-works/pi-durable";
import type { Check } from "../../contracts/agent/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { nextOccurrence } from "../home/index.ts";
import { plain, type SessionDefaults, type StoredTrigger, TriggersDoc } from "../records/durable.ts";
import type { TurnTask } from "../turns/durable.ts";
import { INTERRUPTED, isNews, quietBecause, runCheck } from "./check.durable.ts";
import { fire, recordUnrun, type Where } from "./occurrence.durable.ts";

/** The name of the task that sleeps until a trigger's next occurrence is due, and then makes it. */
export const TRIGGER_TASK = "shrimpy.trigger";

/**
 * What the task for a trigger is made with: which trigger, the revision of its
 * schedule that it is for, and when its first occurrence is due. It keeps the
 * revision and the next time as it goes.
 */
export type Waiting = { name: string; revision: number; next: number };

/**
 * What every state of the task carries: the revision of the trigger's schedule
 * it is for, and when its occurrence is due, which for a task that waits is the
 * next occurrence and for one that is checking is the one it checks for.
 */
export type Standing = { revision: number; next: number };

type Waits = Standing & { phase: "wait" };
/** An occurrence that fired at `firedAt`, with the check it runs as the trigger had it then. */
type Dated = Standing & { firedAt: number; check: Check };
/** The check is about to run. */
type Checks = Dated & { phase: "check" };
/** The check has begun and is not known to have ended: only a task that starts again finds it so. */
type Checking = Dated & { phase: "checking" };
/** The check has ended, with what it printed and whether that is news. */
type Checked = Dated & { phase: "checked"; output: string; news: boolean };
type State = Waits | Checks | Checking | Checked;

type Runtime = TaskRuntime<Waiting, State, null, object>;

export interface TriggerTaskOptions {
  /** The task that follows each occurrence, which is how an occurrence is taken up. */
  turn: TurnTask;
  /** What a session of a trigger's own is configured with when it is made. */
  defaults: SessionDefaults;
  /**
   * Where the thread the trigger names is, when it names one and the agent has no
   * session behind it. Nothing otherwise, and nothing is asked of chat. A trigger
   * with a check has nobody to wake before its check has run, so it is asked once
   * `afterCheck` says it has.
   */
  whereTo(name: string, signal: AbortSignal, afterCheck?: boolean): Promise<Where | undefined>;
  /** Told of an occurrence that could not be made. */
  onError(error: Error): void;
}

const ENDED = { status: "terminal", outcome: { status: "completed", result: null } } as const;

/**
 * The stored trigger, if it is still the trigger a task is for. It is not when
 * its file has since changed its schedule, turned it off or is gone.
 */
async function stillThere(tx: Tx, name: string, revision: number): Promise<StoredTrigger | undefined> {
  const stored = (await tx.doc(TriggersDoc)).triggers;
  const found = Object.hasOwn(stored, name) ? stored[name] : undefined;
  return found === undefined || !found.definition.enabled || found.revision !== revision ? undefined : found;
}

/**
 * The task that sleeps on the engine's timer until a trigger's next occurrence
 * is due, and then makes the occurrence and the next time in one commit. A
 * trigger with a check goes through the check first, with a checkpoint for each
 * step: the check is about to run; it has begun, which is on record in a commit
 * before the command starts; and it has ended, with what it printed and whether
 * that is news. A task that starts again and finds the checkpoint in the middle
 * finds that the agent ended while the command ran, so it does not run the
 * command again, and the occurrence says it was interrupted. One that finds the
 * last makes the occurrence from what was recorded, in one commit with the next
 * time, as for a trigger with no check.
 */
export function triggerTask(options: TriggerTaskOptions) {
  const { turn, defaults } = options;

  /**
   * The trigger's next move in the commit `tx` belongs to: its end when it is not
   * the trigger this task is for any more, and otherwise, after `make` has made
   * what its occurrence leaves, on to its next time, counted from now.
   */
  const onward = async (tx: Tx, runtime: Runtime, name: string, revision: number, make?: (found: StoredTrigger) => Promise<void>) => {
    const found = await stillThere(tx, name, revision);
    if (found === undefined) return ENDED;
    await make?.(found);
    return { status: "running", checkpoint: { phase: "wait", revision, next: nextOccurrence(found.definition.schedule, runtime.now()) } } as const;
  };

  /**
   * An occurrence could not be made. The trigger goes on to its next time, so that one failure does not end it, and
   * the failure is reported. Rethrown when the engine is closing or the task was aborted: it ends the phase and carries
   * on from the checkpoint, and nothing went wrong that needs reporting.
   */
  const gaveUp = async (runtime: Runtime, context: Context, name: string, revision: number, due: number, error: unknown) => {
    if (runtime.signal.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await runtime.commit((tx) => onward(tx, runtime, name, revision), context);
    options.onError(new Error(`The trigger ${name} could not make its occurrence for ${localTime(due)}: ${message}`));
  };

  return defineTask<Waiting, State, null>({
    name: TRIGGER_TASK,
    version: 1,
    initial: (input) => ({ phase: "wait", revision: input.revision, next: input.next }),
    phases: {
      wait: async (waiting, runtime, context) => {
        const { revision, next } = waiting.state.checkpoint;
        const { name } = waiting.input;
        await runtime.sleep(next, context);

        try {
          // Asking chat where the thread is comes first, and takes no part in the commit that makes the occurrence.
          const where = await options.whereTo(name, runtime.signal);
          await runtime.commit(async (tx) => {
            const found = await stillThere(tx, name, revision);
            if (found === undefined) return ENDED;
            const now = runtime.now();
            const { check } = found.definition;
            // A trigger with a check starts it, and makes its occurrence once it knows whether there is news.
            if (check !== undefined) {
              return { status: "running", checkpoint: { phase: "check", revision, next, firedAt: now, check: plain(check) } } as const;
            }
            await fire(tx, { turn, defaults }, plain(found.definition), { due: next, firedAt: now, byHand: false }, where);
            return { status: "running", checkpoint: { phase: "wait", revision, next: nextOccurrence(found.definition.schedule, now) } } as const;
          }, context);
        } catch (error) {
          await gaveUp(runtime, context, name, revision, next, error);
        }
      },

      check: async (checking, runtime, context) => {
        const { revision, next, firedAt, check } = checking.state.checkpoint;
        const { name } = checking.input;
        // The check is on record as begun before its command starts, so that a task that starts again knows it may have run.
        await runtime.commit(() => ({ status: "running", checkpoint: { phase: "checking", revision, next, firedAt, check } }), context);
        const output = await runCheck(await runtime.env(context), name, check, context);
        await runtime.commit(async (tx) => {
          const found = await stillThere(tx, name, revision);
          if (found === undefined) return ENDED;
          const news = isNews(check.when, output, found.last);
          return { status: "running", checkpoint: { phase: "checked", revision, next, firedAt, check, output, news } } as const;
        }, context);
      },

      checking: async (interrupted, runtime, context) => {
        const { revision, next, firedAt } = interrupted.state.checkpoint;
        const { name } = interrupted.input;
        try {
          await runtime.commit(
            (tx) =>
              onward(tx, runtime, name, revision, async (found) => {
                const unrun = { outcome: "interrupted", reason: INTERRUPTED } as const;
                await recordUnrun(tx, turn, plain(found.definition), { due: next, firedAt, byHand: false }, unrun);
              }),
            context,
          );
        } catch (error) {
          await gaveUp(runtime, context, name, revision, next, error);
        }
      },

      checked: async (done, runtime, context) => {
        const { revision, next, firedAt, check, output, news } = done.state.checkpoint;
        const { name } = done.input;
        try {
          // Asking chat where the thread is comes first, and takes no part in the commit that makes the occurrence.
          const where = news ? await options.whereTo(name, runtime.signal, true) : undefined;
          await runtime.commit(
            (tx) =>
              onward(tx, runtime, name, revision, async (found) => {
                const firing = { due: next, firedAt, byHand: false };
                const definition = plain(found.definition);
                const made = news
                  ? await fire(tx, { turn, defaults }, definition, { ...firing, output }, where)
                  : await recordUnrun(tx, turn, definition, firing, { outcome: "quiet", reason: quietBecause(check.when) });
                // What the agent was told, or found nothing to be told, is what the next occurrence compares with. An
                // occurrence that did not run leaves it as it was, so that the news is not lost with the occurrence.
                if (made.ended === null || made.ended === "quiet") found.last = output;
              }),
            context,
          );
        } catch (error) {
          await gaveUp(runtime, context, name, revision, next, error);
        }
      },
    },

    abort: async (_waiting, runtime, context) => {
      await runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context);
    },
  });
}

/** The task that waits for a trigger's next occurrence, to create one when the trigger follows its file. */
export type TriggerTask = ReturnType<typeof triggerTask>;
