import { defineTask, type Tx } from "@earendil-works/pi-durable";
import { localTime } from "../../lib/time/index.ts";
import { nextOccurrence } from "../home/index.ts";
import { plain, type SessionDefaults, TriggersDoc } from "../records/index.ts";
import type { TurnTask } from "../turns/index.ts";
import { fire, type Where } from "./occurrence.ts";

/** The name of the task that sleeps until a trigger's next occurrence is due, and then makes it. */
export const TRIGGER_TASK = "shrimpy.trigger";

/**
 * What the task for a trigger is made with: which trigger, the revision of its
 * schedule that it is for, and when its first occurrence is due. It keeps the
 * revision and the next time as it goes.
 */
export type Waiting = { name: string; revision: number; next: number };
export type Waits = { phase: "wait"; revision: number; next: number };

export interface TriggerTaskOptions {
  /** The task that follows each occurrence, which is how an occurrence is taken up. */
  turn: TurnTask;
  /** What a session of a trigger's own is configured with when it is made. */
  defaults: SessionDefaults;
  /**
   * Where the thread the trigger names is, when it names one and the agent has no
   * session behind it. Nothing otherwise, and nothing is asked of chat.
   */
  whereTo(name: string, signal: AbortSignal): Promise<Where | undefined>;
  /** Told of an occurrence that could not be made. */
  onError(error: Error): void;
}

/**
 * The task that sleeps on the engine's timer until a trigger's next occurrence
 * is due, and then makes the occurrence and the next time in one commit.
 */
export function triggerTask(options: TriggerTaskOptions) {
  const { turn, defaults } = options;
  return defineTask<Waiting, Waits, null>({
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
          const where = await options.whereTo(name, runtime.signal);
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
}

/** The task that waits for a trigger's next occurrence, to create one when the trigger follows its file. */
export type TriggerTask = ReturnType<typeof triggerTask>;
