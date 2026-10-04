import type { Member, Message, Reaction } from "../../contracts/chat/index.ts";
import { newId } from "../../lib/ids/index.ts";
import type { ReportChange } from "./changes.ts";
import { appendEvent } from "./events.ts";
import { parseReceipts, RECEIPTS_ON_MESSAGE } from "./receipts.ts";
import type { Sql } from "./sql.ts";
import { refreshPreview } from "./threads.ts";

type MessageRow = {
  seq: number;
  event_id: string;
  id: string;
  channel_id: string;
  thread_id: string;
  text: string;
  sent_at: number;
  edited_at: number | null;
  deleted: number;
  addressed: string;
  author_id: string;
  author_kind: Member["kind"];
  author_name: string;
  reactions: string;
  receipts: string;
};

/**
 * The reactions on the message that the query calls `m`, as a JSON array: one
 * entry for each emoji in the order it first appeared, naming who put it there
 * in the order they did.
 */
const REACTIONS_ON_MESSAGE = `
  (SELECT json_group_array(json_object('emoji', g.emoji, 'memberIds', json(g.member_ids)) ORDER BY g.first)
     FROM (SELECT emoji, min(event_seq) AS first, json_group_array(member_id ORDER BY event_seq) AS member_ids
             FROM reactions
            WHERE message_seq = m.seq
            GROUP BY emoji) g)`;

const SELECT = `
  SELECT m.seq, p.id AS event_id, m.id, m.channel_id, m.thread_id, m.text, m.sent_at, m.edited_at, m.deleted, m.addressed,
         a.id AS author_id, a.kind AS author_kind, a.name AS author_name,
         ${REACTIONS_ON_MESSAGE} AS reactions,
         ${RECEIPTS_ON_MESSAGE} AS receipts
  FROM messages m
  JOIN events p ON p.seq = m.seq
  JOIN members a ON a.id = m.author_id`;

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  seq: row.seq,
  event: row.event_id,
  channelId: row.channel_id,
  threadId: row.thread_id,
  author: { id: row.author_id, kind: row.author_kind, name: row.author_name },
  text: row.text,
  sentAt: row.sent_at,
  editedAt: row.edited_at,
  deleted: row.deleted === 1,
  addressed: JSON.parse(row.addressed) as string[],
  reactions: JSON.parse(row.reactions) as Reaction[],
  receipts: parseReceipts(row.receipts),
});

/** The message at a position, as it now stands. It must exist. */
export function loadMessage(sql: Sql, seq: number): Message {
  const row = sql.one(`${SELECT} WHERE m.seq = ?`, seq) as MessageRow | undefined;
  if (row === undefined) throw new Error(`Message ${seq} was not stored`);
  return toMessage(row);
}

export interface NewMessage {
  threadId: string;
  authorId: string;
  text: string;
  sentAt: number;
  addressed: string[];
  /** The start of the text, for places that show only that. */
  preview: string;
  /** The author's own ID for this post. A second post with the same one is a retry. */
  requestId: string;
  /** What the request said, so that a retry can be told from a different request that reuses its ID. */
  digest: string;
}

/** What an edit changes about a message. */
export interface MessageEdit {
  actorId: string;
  at: number;
  text: string;
  addressed: string[];
  preview: string;
}

/**
 * Every operation that changes a message writes the event that records the
 * change in the same transaction, and writes none when nothing would change.
 */
export interface MessageOperations {
  /** The message that `authorId` posted under `requestId`, if there is one, with the digest it was posted with. */
  postedBy(authorId: string, requestId: string): { message: Message; digest: string } | undefined;
  /** Add a message to a thread, with its post event and the record that makes its post a retry-safe one. */
  appendMessage(message: NewMessage): Message;
  message(id: string): Message | undefined;
  /** Up to `limit` messages of a thread older than `before`, or the newest when it is null; oldest first. */
  messagesIn(threadId: string, before: number | null, limit: number): Message[];
  /** Change what a message says. The message stays as it is if it already says that. It must not be deleted. */
  editMessage(message: Message, edit: MessageEdit): Message;
  /**
   * Delete a message: it keeps its place and loses its text, its reactions and
   * the text its events carried. A message already deleted stays as it is.
   */
  deleteMessage(message: Message, actorId: string, at: number): Message;
}

export function messageOperations(sql: Sql, report: ReportChange): MessageOperations {
  const select = (where: string, ...params: (string | number | null)[]): Message[] =>
    (sql.all(`${SELECT} ${where}`, ...params) as MessageRow[]).map(toMessage);
  return {
    postedBy(authorId, requestId) {
      const row = sql.one("SELECT message_seq, digest FROM posts WHERE author_id = ? AND request_id = ?", authorId, requestId) as
        | { message_seq: number; digest: string }
        | undefined;
      return row === undefined ? undefined : { message: loadMessage(sql, row.message_seq), digest: row.digest };
    },
    appendMessage(post) {
      const thread = sql.one("SELECT channel_id FROM threads WHERE id = ?", post.threadId) as
        | { channel_id: string }
        | undefined;
      if (thread === undefined) throw new Error(`Unknown thread ${post.threadId}`);
      const posted = appendEvent(sql, {
        kind: "posted",
        channelId: thread.channel_id,
        actorId: post.authorId,
        at: post.sentAt,
        text: post.text,
      });
      sql.run(
        `INSERT INTO messages (seq, id, channel_id, thread_id, author_id, text, preview, sent_at, addressed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        posted.seq,
        newId("msg"),
        thread.channel_id,
        post.threadId,
        post.authorId,
        post.text,
        post.preview,
        post.sentAt,
        JSON.stringify(post.addressed),
      );
      sql.run(
        "INSERT INTO posts (author_id, request_id, message_seq, digest) VALUES (?, ?, ?, ?)",
        post.authorId,
        post.requestId,
        posted.seq,
        post.digest,
      );
      // A clock that steps back must not make a thread look older than it was.
      sql.run(
        `UPDATE threads
         SET message_count = message_count + 1, last_seq = ?, updated_at = max(updated_at, ?)
         WHERE id = ?`,
        posted.seq,
        post.sentAt,
        post.threadId,
      );
      refreshPreview(sql, post.threadId);
      report({ kind: "event", threadId: post.threadId });
      return loadMessage(sql, posted.seq);
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
    editMessage(message, edit) {
      if (message.deleted) throw new Error(`Message ${message.id} is deleted and cannot be edited`);
      if (message.text === edit.text) return message;
      appendEvent(sql, {
        kind: "edited",
        channelId: message.channelId,
        targetSeq: message.seq,
        actorId: edit.actorId,
        at: edit.at,
        text: edit.text,
      });
      sql.run(
        "UPDATE messages SET text = ?, preview = ?, addressed = ?, edited_at = ? WHERE seq = ?",
        edit.text,
        edit.preview,
        JSON.stringify(edit.addressed),
        edit.at,
        message.seq,
      );
      refreshPreview(sql, message.threadId);
      report({ kind: "event", threadId: message.threadId });
      return loadMessage(sql, message.seq);
    },
    deleteMessage(message, actorId, at) {
      if (message.deleted) return message;
      appendEvent(sql, {
        kind: "deleted",
        channelId: message.channelId,
        targetSeq: message.seq,
        actorId,
        at,
      });
      sql.run("UPDATE messages SET text = '', preview = '', deleted = 1 WHERE seq = ?", message.seq);
      sql.run("DELETE FROM reactions WHERE message_seq = ?", message.seq);
      // The text is gone from the log as well as from the message. The events stay: that it happened is a fact.
      sql.run("UPDATE events SET text = '' WHERE message_seq = ? AND kind IN ('posted', 'edited')", message.seq);
      refreshPreview(sql, message.threadId);
      report({ kind: "event", threadId: message.threadId });
      return loadMessage(sql, message.seq);
    },
  };
}
