import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
import {
  type CommitPublication,
  type ConversationId,
  defineTask,
  type Harness,
  type TaskRecord,
  type ToolExecutionApi,
} from "@earendil-works/pi-durable";
import type { OnceTrigger } from "../../contracts/agent/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { ABORTED, COMPLETED, failTask, tasksOfKind } from "../host/durable.ts";
import type { Breadcrumb, Place } from "../inputs/index.ts";
import { learnPlace, openSession, type SessionDefaults } from "../records/durable.ts";
import { takeUp, type TurnTask } from "../turns/durable.ts";

/** The durable task that sleeps until a one-shot trigger fires, then takes it up as an `OccurrenceInput`. */
export const ONCE_TRIGGER_TASK = "shrimpy.trigger-once";

/** How many pending one-shot triggers a thread may hold at once. */
export const MAX_ONCE_PER_THREAD = 20;

export type OnceWaiting = {
  id: string;
  threadId: string;
  channelId: string;
  askedAt: number;
  due: number;
  prompt: string;
};

export interface OnceOptions {
  turn: TurnTask;
  defaults: SessionDefaults;
  breadcrumbs(): Promise<readonly Breadcrumb[]>;
  onError(error: Error): void;
}

export type OnceScheduled = { trigger: OnceTrigger } | { waiting: number };

const bg = BACKGROUND_CONTEXT;

export function createOnceTask(options: OnceOptions) {
  return defineTask<OnceWaiting, { phase: "sleep" } | { phase: "due" }, null>({
    name: ONCE_TRIGGER_TASK,
    version: 1,
    initial: () => ({ phase: "sleep" }),
    phases: {
      sleep: (waiting, runtime, context) => runtime.sleepUntil(waiting.input.due, { phase: "due" }, context),

      due: async (waiting, runtime, context) => {
        const { id, threadId, channelId, askedAt, due, prompt } = waiting.input;
        try {
          const crumbs = await options.breadcrumbs();
          await runtime.commit(async (tx) => {
            const now = runtime.now();
            await takeUp(
              tx,
              options.turn,
              runtime.conversationId,
              {
                occurrence: {
                  id,
                  trigger: null,
                  due,
                  firedAt: now,
                  byHand: false,
                  schedule: null,
                  askedAt,
                  prompt,
                },
                threadId,
                channelId,
              },
              crumbs,
            );
            return COMPLETED;
          }, context);
        } catch (error) {
          await failTask(runtime, context, error, options, `The one-time trigger for ${localTime(due)} could not fire`);
        }
      },
    },

    // Cancelling a one-shot trigger is silent: no wake line and no cancelled reminder injected.
    abort: async (_waiting, runtime, context) => {
      await runtime.commit(() => ABORTED, context);
    },
  });
}

export type OnceTask = ReturnType<typeof createOnceTask>;

/** Schedule a one-shot trigger for `target` thread, idempotently by the tool call's task ID. */
export async function scheduleOnce(
  api: ToolExecutionApi,
  onceTask: OnceTask,
  defaults: SessionDefaults,
  target: { threadId: string; channelId: string; place?: Place },
  request: { askedAt: number; due: number; prompt: string },
  at: Context,
): Promise<OnceScheduled> {
  const id = `once_${String(api.taskId)}`;
  return api.commit(async (tx): Promise<OnceScheduled> => {
    const session = await openSession(tx, defaults, { threadId: target.threadId, channelId: target.channelId });
    if (target.place !== undefined) learnPlace(session, target.place);
    const targetConv = session.conversationId as ConversationId;
    let waiting = 0;
    for (const record of await tasksOfKind(tx, ONCE_TRIGGER_TASK, { conversationId: targetConv })) {
      const existing = record.input as OnceWaiting;
      if (existing.id === id) return { trigger: toView(existing) };
      if (isWaiting(record)) waiting += 1;
    }
    if (waiting >= MAX_ONCE_PER_THREAD) return { waiting };
    const input: OnceWaiting = {
      id,
      threadId: target.threadId,
      channelId: target.channelId,
      askedAt: request.askedAt,
      due: request.due,
      prompt: request.prompt,
    };
    await tx.createTask(onceTask, input, { ownership: { kind: "conversation" }, conversationId: targetConv, background: true });
    return { trigger: toView(input) };
  }, at);
}

/** List all pending one-shot triggers across the agent, soonest first. */
export async function listOnce(harness: Harness): Promise<OnceTrigger[]> {
  const { tasks } = await harness.inspect(bg);
  return tasks
    .filter(({ record }) => record.kind === ONCE_TRIGGER_TASK && isWaiting(record))
    .map(({ record }) => toView(record.input as OnceWaiting))
    .sort((a, b) => a.due - b.due);
}

/** Cancel a pending one-shot trigger by ID silently. Refuses if not found. */
export async function cancelOnce(harness: Harness, id: string): Promise<void> {
  const { tasks } = await harness.inspect(bg);
  const found = tasks.find(
    ({ record }) => record.kind === ONCE_TRIGGER_TASK && isWaiting(record) && (record.input as OnceWaiting).id === id,
  );
  if (found === undefined) refuse(`There is no pending one-time trigger called ${id}.`);
  await harness.abortTask(found.record.id, bg);
}

/** Whether a commit created, fired, or cancelled a one-shot trigger. */
export function touchesOnce(publication: CommitPublication): boolean {
  return publication.changes.some((change) => change.type === "task" && change.value.kind === ONCE_TRIGGER_TASK);
}

function isWaiting(record: TaskRecord<JsonValue, JsonValue, JsonValue>): boolean {
  return record.state.status !== "terminal" && !record.abortRequested;
}

function toView({ id, threadId, askedAt, due, prompt }: OnceWaiting): OnceTrigger {
  return { id, threadId, askedAt, due, prompt };
}
