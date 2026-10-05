import type { Context, JsonValue } from "@earendil-works/chord";
import {
  type ConversationId,
  type Cursor,
  defineExtension,
  defineTask,
  type Extension,
  type Harness,
  type TaskRecord,
  type ToolExecutionApi,
  type Tx,
} from "@earendil-works/pi-durable";
import { localTime } from "../../lib/time/index.ts";
import type { Wakeup } from "../inputs/index.ts";
import {
  keepCancelled,
  placeOfSession,
  sessionAddress,
  type SessionPlace,
  type SessionRecord,
  SessionsDoc,
} from "../records/durable.ts";
import { takeUp, type TurnTask } from "../turns/durable.ts";

/** The name of the task that waits for a wake-up to come due, and then takes it up as an input. */
const WAKEUP_TASK = "shrimpy.wakeup";

/** How many wake-ups a session may have waiting at once. */
const MAX_WAITING = 20;

/** What the task that waits is given: the wake-up, and where its session is. */
type Waiting = { wakeup: Wakeup } & SessionPlace;

/** The session's record for a wake-up, if the session has one. */
function sessionOfWaiting(sessions: Record<string, SessionRecord>, waiting: Waiting): SessionRecord | undefined {
  const address = sessionAddress(waiting);
  return address !== undefined && Object.hasOwn(sessions, address) ? sessions[address] : undefined;
}

/** What a wake-up is asked for with. */
export interface WakeupRequest {
  /** When the call was made, and when the wake-up is for: milliseconds since the epoch. */
  askedAt: number;
  due: number;
  /** What the agent wants to be told when it is woken. */
  note: string;
}

/**
 * The wake-up that was set, and whether it will come in a thread; or how many
 * were already waiting when the session had as many as it may.
 */
export type WakeupSet = { wakeup: Wakeup; inThread: boolean } | { waiting: number };

/** The wake-ups of the agent's sessions, as the tool that asks for one sees them. */
export interface Wakeups {
  /**
   * Set a wake-up for the session a tool call runs in. It is named for the call,
   * so a call that runs again after a crash finds the wake-up its first run set
   * and sets no second one. It is refused when the session has `MAX_WAITING`.
   */
  set(api: ToolExecutionApi, request: WakeupRequest, context: Context): Promise<WakeupSet>;
}

export interface WakeupsOptions {
  /** Told of a wake-up that came due and could not be taken up. */
  onError(error: Error): void;
}

/**
 * The wake-ups an agent asks for. Each is a background task of the session that
 * asked, which sleeps on the engine's timer until the wake-up is due and then
 * takes it up as an input of the session, in one commit, so it is taken up once
 * however often the agent stops meanwhile. A wake-up that came due while the
 * agent was down is taken up when it starts again. Sleeping is not work: the
 * task is a background task of a kind that nothing counts, so the session is not
 * working, and its thread is not marked, until the turn the wake-up starts is.
 * Ending a wake-up that waits keeps it, for the session's next input to tell the
 * model that it was cancelled. A session behind no thread, a trigger's own, has
 * wake-ups too.
 */
export function createWakeups(turn: TurnTask, options: WakeupsOptions): Wakeups & { extension: Extension } {
  const task = defineTask<Waiting, { phase: "sleep" }, null>({
    name: WAKEUP_TASK,
    version: 1,
    initial: () => ({ phase: "sleep" }),
    phases: {
      sleep: async (waiting, runtime, context) => {
        const { wakeup } = waiting.input;
        await runtime.sleep(wakeup.due, context);
        try {
          await runtime.commit(async (tx) => {
            await takeUp(tx, turn, runtime.conversationId, waiting.input);
            return { status: "terminal", outcome: { status: "completed", result: null } };
          }, context);
        } catch (error) {
          // The engine is closing, or the task was aborted: the engine ends the phase and carries on from the checkpoint.
          if (runtime.signal.aborted) throw error;
          const message = error instanceof Error ? error.message : String(error);
          // A task being aborted refuses this too, and then nothing went wrong that needs reporting.
          await runtime.commit(() => ({ status: "terminal", outcome: { status: "failed", error: { message } } }), context);
          options.onError(new Error(`The wake-up for ${localTime(wakeup.due)} could not be taken up: ${message}`));
        }
      },
    },

    abort: async (waiting, runtime, context) => {
      await runtime.commit(async (tx) => {
        const session = sessionOfWaiting((await tx.doc(SessionsDoc)).sessions, waiting.input);
        if (session !== undefined) keepCancelled(session, [waiting.input.wakeup]);
        return { status: "terminal", outcome: { status: "aborted" } };
      }, context);
    },
  });

  return {
    extension: defineExtension({ name: "wakeups", tasks: [task] }),

    async set(api, request, context) {
      const id = `wake_${String(api.taskId)}`;
      const place = await placeOfSession(api, api.conversationId, context);
      if (place === undefined) throw new Error("The session is not one the agent keeps, so there is nowhere to wake it.");
      return api.commit(async (tx): Promise<WakeupSet> => {
        let waiting = 0;
        for (const record of await sleepers(tx, api.conversationId)) {
          const { wakeup } = record.input as Waiting;
          if (wakeup.id === id) return { wakeup, inThread: "threadId" in place };
          if (isWaiting(record)) waiting += 1;
        }
        if (waiting >= MAX_WAITING) return { waiting };
        const wakeup: Wakeup = { id, askedAt: request.askedAt, due: request.due, note: request.note };
        // The session's, not the tool call's: a call that finishes does not end what it set.
        await tx.createTask(task, { ...place, wakeup }, { ownership: { kind: "conversation" }, background: true });
        return { wakeup, inThread: "threadId" in place };
      }, context);
    },
  };
}

/**
 * End the wake-ups a session is waiting on, and wait until each has ended. The
 * session keeps each one as cancelled, and its next input tells the model.
 */
export async function cancelWakeups(harness: Harness, conversationId: ConversationId, context: Context): Promise<void> {
  const { tasks } = await harness.inspect(context);
  const waiting = tasks
    .filter(({ record }) => record.kind === WAKEUP_TASK && record.conversationId === conversationId && !record.abortRequested)
    .map(({ record }) => record.id);
  for (const id of waiting) await harness.abortTask(id, context);
  for (const id of waiting) await harness.waitForTask(id, context);
}

/** Every task that waits for a wake-up of one session, ended or not. */
async function sleepers(tx: Tx, conversationId: ConversationId): Promise<TaskRecord<JsonValue, JsonValue, JsonValue>[]> {
  const found: TaskRecord<JsonValue, JsonValue, JsonValue>[] = [];
  let cursor: Cursor | undefined;
  do {
    const page = await tx.scanTasks({ conversationId, kind: WAKEUP_TASK }, 100, cursor);
    found.push(...page.items);
    cursor = page.next;
  } while (cursor !== undefined);
  return found;
}

/** Whether a wake-up is still to come: its task has not ended and is not being ended. */
function isWaiting(record: TaskRecord<JsonValue, JsonValue, JsonValue>): boolean {
  return record.state.status !== "terminal" && !record.abortRequested;
}
