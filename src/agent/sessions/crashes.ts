import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ConversationId, Harness } from "@earendil-works/pi-durable";
import { RecordsDoc } from "./documents.ts";
import { MAX_CRASHES, turnsUnderway } from "./turn-task.ts";

const context = BACKGROUND_CONTEXT;

/** One run of the agent, from its start to its stop. */
export interface Run {
  /** Say in the records that the agent stopped in an orderly way. Call it before the engine closes. */
  stopped(): Promise<void>;
}

/**
 * Begin a run: say in the records that the agent is running, and count what the
 * last run's end cost. A start that finds the records already saying so follows
 * a run that ended without an orderly stop, such as a kill, a crash or a power
 * cut, and every input whose turn it left underway has been through one more
 * crash. An input that reaches `MAX_CRASHES` is not followed again, so its turn
 * is stopped here, as stopping a session's work does, and the task that follows
 * the input tells its source it failed.
 *
 * Call it once, after the sessions follow the home and before the engine
 * resumes: counting is one commit, together with the note, so the turns it
 * counts cannot move meanwhile, and a turn that is stopped never runs again. An
 * abort mark is durable and nothing is scheduled before the engine resumes, so
 * the turn goes straight to being aborted when it does.
 */
export async function beginRun(harness: Harness): Promise<Run> {
  const reached = await harness.commit(async (tx) => {
    const records = await tx.doc(RecordsDoc);
    const lastEndedUnexpectedly = records.running === true;
    records.running = true;
    const reached = new Set<ConversationId>();
    if (lastEndedUnexpectedly) {
      for (const { inputId, conversationId } of await turnsUnderway(tx)) {
        records.crashes ??= {};
        const crashes = (records.crashes[inputId] ?? 0) + 1;
        records.crashes[inputId] = crashes;
        if (crashes >= MAX_CRASHES) reached.add(conversationId);
      }
    }
    return [...reached];
  }, context);
  await stopTurns(harness, reached);

  return {
    async stopped() {
      await harness.commit(async (tx) => {
        (await tx.doc(RecordsDoc)).running = false;
      }, context);
    },
  };
}

/**
 * Mark the work of these sessions as aborted, the tasks a stop marks: those the
 * session owns that are not background. What they own is marked from them. The
 * tasks that follow the sessions' events are background, and tell their events
 * how it ended.
 */
async function stopTurns(harness: Harness, sessions: readonly ConversationId[]): Promise<void> {
  if (sessions.length === 0) return;
  const { tasks } = await harness.inspect(context);
  for (const { record } of tasks) {
    if (sessions.includes(record.conversationId) && !record.background && record.owner === undefined) {
      await harness.abortTask(record.id, context);
    }
  }
}
