import type { Context } from "@earendil-works/chord/context";
import type { JsonValue } from "@earendil-works/chord/json";
import type { ConversationId, Cursor, Harness, TaskRecord, TaskRuntime, Tx } from "@earendil-works/pi-durable";
import { asError } from "../../lib/errors/index.ts";

/** What a scan of tasks reads from: the commit it is part of, or one that makes a commit of its own for each page. */
export type TaskScanner = Pick<Tx, "scanTasks">;

/** The statuses of a task that has not settled on an outcome: it goes on from its checkpoint. */
const LIVE = ["pending", "running", "waiting", "sleeping"] as const;

/** Tasks read at a time. */
const PAGE = 100;

/**
 * Every task of `kind`, in the order the engine made them within each status: of
 * one session when `conversationId` is given, and only the live ones that are not
 * being ended when `live` is set, or else every one, ended or not.
 */
export async function tasksOfKind(
  scanner: TaskScanner,
  kind: string,
  filter: { conversationId?: ConversationId; live?: boolean } = {},
): Promise<TaskRecord<JsonValue, JsonValue, JsonValue>[]> {
  const of = filter.conversationId === undefined ? {} : { conversationId: filter.conversationId };
  const queries = filter.live === true ? LIVE.map((status) => ({ ...of, kind, status, abortRequested: false })) : [{ ...of, kind }];
  const found: TaskRecord<JsonValue, JsonValue, JsonValue>[] = [];
  for (const query of queries) {
    let cursor: Cursor | undefined;
    do {
      const page = await scanner.scanTasks(query, PAGE, cursor);
      found.push(...page.items);
      cursor = page.next;
    } while (cursor !== undefined);
  }
  return found;
}

/**
 * End the tasks of `kinds` that one session has live, and wait until each has
 * ended. What ending one does is up to its task's own way of being aborted.
 */
export async function endTasks(harness: Harness, conversationId: ConversationId, kinds: readonly string[], context: Context): Promise<void> {
  const { tasks } = await harness.inspect(context);
  const ending = tasks
    .filter(({ record }) => kinds.includes(record.kind) && record.conversationId === conversationId && !record.abortRequested)
    .map(({ record }) => record.id);
  for (const id of ending) await harness.abortTask(id, context);
  for (const id of ending) await harness.waitForTask(id, context);
}

/**
 * End the task that `runtime` runs as failed, in one commit with whatever
 * `also` writes, and tell `told` that `what` could not be done, with the message
 * of `error` as why. When the engine is closing or the task was aborted, `error`
 * is thrown again instead: the engine ends the phase and carries on from the
 * checkpoint. A task being aborted refuses the commit too, and then nothing went
 * wrong that needs reporting.
 */
export async function failTask<I, S, R, H extends object>(
  runtime: TaskRuntime<I, S, R, H>,
  context: Context,
  error: unknown,
  told: { onError(error: Error): void },
  what: string,
  also?: (tx: Tx) => Promise<void>,
): Promise<void> {
  if (runtime.signal.aborted) throw error;
  const message = asError(error).message;
  await runtime.commit(async (tx) => {
    await also?.(tx);
    return { status: "terminal", outcome: { status: "failed", error: { message } } };
  }, context);
  told.onError(new Error(`${what}: ${message}`));
}
