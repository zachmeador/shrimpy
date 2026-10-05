import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { CommitChange, Harness } from "@earendil-works/pi-durable";
import type { Outstanding, Working } from "../intake/index.ts";
import { phaseOf, TURN_TASK } from "./turn-task.ts";

const context = BACKGROUND_CONTEXT;

/**
 * What the agent is working on, read from the engine: an input is worked on
 * from the moment the agent takes it up until its source is told how it ended,
 * which is as long as its task is live. A wake-up that is only waiting is not
 * an input yet, and is not counted. Nothing is kept beside the tasks, so a task
 * that ends in any way, a failure included, stops counting.
 */
export function createWorking(harness: Harness): Working {
  /** The live tasks that follow an input, each with whether its turn is over and its source has yet to be told. */
  async function followed() {
    const { tasks, submissions } = await harness.inspect(context);
    const busy = new Set(submissions.filter(({ status }) => status === "placed").map(({ conversationId }) => conversationId));
    return tasks
      .filter(({ record }) => record.kind === TURN_TASK)
      .map(({ record }) => {
        const phase = phaseOf(record);
        // A session with no input being answered has nothing left to run for the task that follows it.
        const owing = phase === "tell" || (phase === "follow" && !busy.has(record.conversationId));
        return { id: record.id, threadId: (record.input as Outstanding).threadId, owing };
      });
  }

  return {
    async threads() {
      return new Set((await followed()).map(({ threadId }) => threadId));
    },

    onChange(listener) {
      return harness.subscribeCommits(({ changes }) => {
        if (changes.some(startsOrEndsATurn)) listener();
      });
    },

    async untilTold(signal) {
      // Read through a function: it changes while the wait goes on.
      const stopped = (): boolean => signal.aborted;
      while (!stopped()) {
        const owing = (await followed()).filter((turn) => turn.owing);
        if (owing.length === 0) return;
        try {
          await Promise.all(owing.map(({ id }) => harness.waitForTask(id, withAbortSignal(signal, context))));
        } catch (error) {
          if (stopped()) return;
          throw error;
        }
      }
    },
  };
}

/** A task that follows an input was just made, or just ended. */
function startsOrEndsATurn(change: CommitChange): boolean {
  if (change.type !== "task" || change.value.kind !== TURN_TASK) return false;
  return change.value.state.status === "pending" || change.value.state.status === "terminal";
}
