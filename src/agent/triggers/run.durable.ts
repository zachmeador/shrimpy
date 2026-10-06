import type { Context } from "@earendil-works/chord";
import { defineTask, type TaskRuntime, type Tx } from "@earendil-works/pi-durable";
import type { Check } from "../../contracts/agent/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { type StoredTrigger, TriggersDoc } from "../records/durable.ts";
import { errorsOf, runCheck } from "./check.durable.ts";
import { recordInterrupted, settle } from "./occurrence.durable.ts";
import { beforeSettling, ENDED, type TriggerTaskOptions } from "./task.durable.ts";

/** The name of the task that runs a trigger's check when someone asks for it, and makes the occurrence from what it printed. */
export const RUN_TASK = "shrimpy.trigger-run";

/**
 * What the task for a check run by hand is made with: the trigger, the ID its
 * occurrence will have, which whoever asked was given, when it was asked for, and
 * the check as the trigger had it then.
 */
export type Asked = { name: string; id: string; firedAt: number; check: Check };

/** The check is about to run; it has begun and is not known to have ended, which only a task that starts again finds; or it has ended with what it printed. */
type Ran = { phase: "check" } | { phase: "checking" } | { phase: "checked"; output: string };

/**
 * The task that runs a trigger's check now, apart from the trigger's own task,
 * which keeps sleeping until its next time, so that the schedule does not move.
 * It goes through the same steps as a scheduled check, so the command runs once:
 * the check is on record as begun in a commit before the command starts, and a
 * task that starts again and finds it says the occurrence was interrupted and
 * does not run the command again. Whatever the check prints is news, because
 * someone asked: the agent is woken with the prompt and the output, or the
 * breadcrumb is written, and the trigger keeps what was printed for its next
 * scheduled occurrence to compare with. The trigger may be off, and may have a
 * new schedule by the time the check ends; it only has to be there.
 */
export function runTask(options: TriggerTaskOptions) {
  const { turn, defaults } = options;

  const stored = async (tx: Tx, name: string): Promise<StoredTrigger | undefined> => {
    const triggers = (await tx.doc(TriggersDoc)).triggers;
    return Object.hasOwn(triggers, name) ? triggers[name] : undefined;
  };

  /**
   * The occurrence could not be made, and nothing runs the check again: the task ends, and the failure is reported.
   * Rethrown when the engine is closing or the task was aborted, which ends the phase to carry on from the checkpoint.
   */
  const gaveUp = async (runtime: TaskRuntime<Asked, Ran, null, object>, context: Context, asked: Asked, error: unknown) => {
    if (runtime.signal.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    await runtime.commit(() => ({ status: "terminal", outcome: { status: "failed", error: { message } } }), context);
    options.onError(new Error(`The trigger ${asked.name} could not make the occurrence that was run by hand at ${localTime(asked.firedAt)}: ${message}`));
  };

  return defineTask<Asked, Ran, null>({
    name: RUN_TASK,
    version: 1,
    initial: () => ({ phase: "check" }),
    phases: {
      check: async (task, runtime, context) => {
        const { name, check } = task.input;
        // The check is on record as begun before its command starts, so that a task that starts again knows it may have run.
        await runtime.commit(() => ({ status: "running", checkpoint: { phase: "checking" } }), context);
        const output = await runCheck(await runtime.env(context), errorsOf(name, true), check, context);
        await runtime.commit(() => ({ status: "running", checkpoint: { phase: "checked", output } }), context);
      },

      checking: async (interrupted, runtime, context) => {
        const { name, id, firedAt } = interrupted.input;
        try {
          await runtime.commit(async (tx) => {
            const found = await stored(tx, name);
            if (found !== undefined) await recordInterrupted(tx, turn, found, { id, due: firedAt, firedAt, byHand: true });
            return ENDED;
          }, context);
        } catch (error) {
          await gaveUp(runtime, context, interrupted.input, error);
        }
      },

      checked: async (done, runtime, context) => {
        const { name, id, firedAt, check } = done.input;
        const finding = { check, output: done.state.checkpoint.output, news: true };
        try {
          const { where, breadcrumbs } = await beforeSettling(options, runtime.signal, name, finding);
          await runtime.commit(async (tx) => {
            const found = await stored(tx, name);
            if (found !== undefined) {
              await settle(tx, { turn, defaults, breadcrumbs }, found, finding, { id, due: firedAt, firedAt, byHand: true }, where);
            }
            return ENDED;
          }, context);
        } catch (error) {
          await gaveUp(runtime, context, done.input, error);
        }
      },
    },

    abort: async (_asked, runtime, context) => {
      await runtime.commit(() => ({ status: "terminal", outcome: { status: "aborted" } }), context);
    },
  });
}

/** The task that runs a trigger's check by hand, to create one when someone fires a trigger that has a check. */
export type RunTask = ReturnType<typeof runTask>;
