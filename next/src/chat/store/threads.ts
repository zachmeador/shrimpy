import type { Thread } from "../../contracts/chat/index.ts";
import type { ReportChange } from "./changes.ts";
import { newId } from "./ids.ts";
import type { Sql } from "./sql.ts";

type ThreadRow = {
  id: string;
  channel_id: string;
  main: number;
  name: string | null;
  preview: string | null;
  archived: number;
  updated_at: number;
};

const COLUMNS = "id, channel_id, main, name, preview, archived, updated_at";

/** A thread as stored. Who is working in it lives in memory, never in the store. */
export type ThreadRecord = Omit<Thread, "working">;

const toThread = (row: ThreadRow): ThreadRecord => ({
  id: row.id,
  channelId: row.channel_id,
  main: row.main === 1,
  name: row.name,
  preview: row.preview,
  archived: row.archived === 1,
  updatedAt: row.updated_at,
});

export interface ThreadOperations {
  thread(id: string): ThreadRecord | undefined;
  /** A channel's threads, the most recently updated first. */
  threadsIn(channelId: string): ThreadRecord[];
  /** Start a side thread. */
  addThread(channelId: string, name: string | null, now: number): ThreadRecord;
  renameThread(id: string, name: string): ThreadRecord;
  archiveThread(id: string, archived: boolean): ThreadRecord;
  /** How many messages the thread holds. */
  messageCount(id: string): number;
}

/** Create a thread's row. A channel's main thread is made with the channel. */
export function insertThread(
  sql: Sql,
  thread: { channelId: string; name: string | null; main: boolean; now: number },
): string {
  const id = newId("th");
  sql.run(
    "INSERT INTO threads (id, channel_id, main, name, updated_at) VALUES (?, ?, ?, ?, ?)",
    id,
    thread.channelId,
    thread.main ? 1 : 0,
    thread.name,
    thread.now,
  );
  return id;
}

export function threadOperations(sql: Sql, report: ReportChange): ThreadOperations {
  const find = (id: string): ThreadRecord | undefined => {
    const row = sql.one(`SELECT ${COLUMNS} FROM threads WHERE id = ?`, id) as ThreadRow | undefined;
    return row === undefined ? undefined : toThread(row);
  };
  const get = (id: string): ThreadRecord => {
    const thread = find(id);
    if (thread === undefined) throw new Error(`Unknown thread ${id}`);
    return thread;
  };
  return {
    thread: find,
    threadsIn(channelId) {
      const rows = sql.all(
        `SELECT ${COLUMNS} FROM threads WHERE channel_id = ? ORDER BY updated_at DESC, rowid DESC`,
        channelId,
      ) as ThreadRow[];
      return rows.map(toThread);
    },
    addThread(channelId, name, now) {
      const id = insertThread(sql, { channelId, name, main: false, now });
      report({ kind: "thread", threadId: id });
      return get(id);
    },
    renameThread(id, name) {
      sql.run("UPDATE threads SET name = ? WHERE id = ?", name, id);
      report({ kind: "thread", threadId: id });
      return get(id);
    },
    archiveThread(id, archived) {
      sql.run("UPDATE threads SET archived = ? WHERE id = ?", archived ? 1 : 0, id);
      report({ kind: "thread", threadId: id });
      return get(id);
    },
    messageCount(id) {
      const row = sql.one("SELECT message_count FROM threads WHERE id = ?", id) as
        | { message_count: number }
        | undefined;
      return row?.message_count ?? 0;
    },
  };
}
