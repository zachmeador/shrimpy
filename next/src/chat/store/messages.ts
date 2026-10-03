import type { Member, Message } from "../../contracts/chat/index.ts";
import type { ReportChange } from "./changes.ts";
import { newId } from "./ids.ts";
import { parseReceipts, RECEIPTS_ON_MESSAGE } from "./receipts.ts";
import type { Sql } from "./sql.ts";

type MessageRow = {
  seq: number;
  id: string;
  channel_id: string;
  thread_id: string;
  text: string;
  sent_at: number;
  addressed: string;
  author_id: string;
  author_kind: Member["kind"];
  author_name: string;
  receipts: string;
};

const SELECT = `
  SELECT m.seq, m.id, m.channel_id, m.thread_id, m.text, m.sent_at, m.addressed,
         a.id AS author_id, a.kind AS author_kind, a.name AS author_name,
         ${RECEIPTS_ON_MESSAGE} AS receipts
  FROM messages m
  JOIN members a ON a.id = m.author_id`;

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  seq: row.seq,
  channelId: row.channel_id,
  threadId: row.thread_id,
  author: { id: row.author_id, kind: row.author_kind, name: row.author_name },
  text: row.text,
  sentAt: row.sent_at,
  addressed: JSON.parse(row.addressed) as string[],
  receipts: parseReceipts(row.receipts),
});

export interface NewMessage {
  threadId: string;
  authorId: string;
  text: string;
  sentAt: number;
  addressed: string[];
  /** The author's own ID for this post. A second post with the same one is a retry. */
  requestId: string;
  /** The start of the text, kept on the thread when it has none yet. */
  preview: string;
}

export interface MessageOperations {
  /** The message that `authorId` posted under `requestId`, if there is one. */
  postedBy(authorId: string, requestId: string): Message | undefined;
  /** Add a message to a thread, with the record that makes its post a retry-safe one. */
  appendMessage(message: NewMessage): Message;
  message(id: string): Message | undefined;
  /** Up to `limit` messages of a thread older than `before`, or the newest when it is null; oldest first. */
  messagesIn(threadId: string, before: number | null, limit: number): Message[];
  /** Up to `limit` messages after `cursor` in the channels a member belongs to; oldest first. */
  messagesAfter(memberId: string, cursor: number, limit: number): Message[];
  /** The newest message position, or 0 while there are no messages. */
  head(): number;
}

export function messageOperations(sql: Sql, report: ReportChange): MessageOperations {
  const select = (where: string, ...params: (string | number | null)[]): Message[] =>
    (sql.all(`${SELECT} ${where}`, ...params) as MessageRow[]).map(toMessage);
  return {
    postedBy(authorId, requestId) {
      return select(
        `JOIN posts p ON p.message_seq = m.seq WHERE p.author_id = ? AND p.request_id = ?`,
        authorId,
        requestId,
      )[0];
    },
    appendMessage(post) {
      const thread = sql.one("SELECT channel_id FROM threads WHERE id = ?", post.threadId) as
        | { channel_id: string }
        | undefined;
      if (thread === undefined) throw new Error(`Unknown thread ${post.threadId}`);
      const inserted = sql.one(
        `INSERT INTO messages (id, channel_id, thread_id, author_id, text, sent_at, addressed)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
        newId("msg"),
        thread.channel_id,
        post.threadId,
        post.authorId,
        post.text,
        post.sentAt,
        JSON.stringify(post.addressed),
      ) as { seq: number };
      sql.run(
        "INSERT INTO posts (author_id, request_id, message_seq) VALUES (?, ?, ?)",
        post.authorId,
        post.requestId,
        inserted.seq,
      );
      // A clock that steps back must not make a thread look older than it was.
      sql.run(
        `UPDATE threads
         SET message_count = message_count + 1,
             last_seq = ?,
             updated_at = max(updated_at, ?),
             preview = coalesce(preview, ?)
         WHERE id = ?`,
        inserted.seq,
        post.sentAt,
        post.preview,
        post.threadId,
      );
      report({ kind: "message", threadId: post.threadId });
      const message = select("WHERE m.seq = ?", inserted.seq)[0];
      if (message === undefined) throw new Error(`Message ${inserted.seq} was not stored`);
      return message;
    },
    message: (id) => select("WHERE m.id = ?", id)[0],
    messagesIn(threadId, before, limit) {
      const rows = sql.all(
        `SELECT * FROM (
           ${SELECT}
           WHERE m.thread_id = ? AND (? IS NULL OR m.seq < ?)
           ORDER BY m.seq DESC LIMIT ?
         ) ORDER BY seq`,
        threadId,
        before,
        before,
        limit,
      ) as MessageRow[];
      return rows.map(toMessage);
    },
    messagesAfter: (memberId, cursor, limit) =>
      select(
        `WHERE m.seq > ? AND m.channel_id IN (SELECT channel_id FROM memberships WHERE member_id = ?)
         ORDER BY m.seq LIMIT ?`,
        cursor,
        memberId,
        limit,
      ),
    head() {
      const row = sql.one("SELECT coalesce(max(seq), 0) AS head FROM messages") as { head: number };
      return row.head;
    },
  };
}
