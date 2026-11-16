import type { JsonValue } from "@earendil-works/chord/json";
import type { ConversationId, Cursor, TaskRecord, Tx } from "@earendil-works/pi-durable";

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
