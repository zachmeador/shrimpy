import type { Member, Message, Reaction, TriggerLine } from "../../contracts/chat/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { appendEvent } from "./append.ts";
import type { ReportChange } from "./changes.ts";
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
  mentions: string;
  author_id: string;
  author_kind: Member["kind"];
  author_name: string;
  reactions: string;
  receipts: string;
  /** The trigger of a trigger's line, which has the next three too; null for a message. */
  line_trigger: string | null;
  fired_at: number | null;
  prompt: string | null;
  output: string | null;
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
  SELECT m.seq, p.id AS event_id, m.id, m.channel_id, m.thread_id, m.text, m.sent_at, m.edited_at, m.deleted, m.mentions,
         a.id AS author_id, a.kind AS author_kind, a.name AS author_name,
         ${REACTIONS_ON_MESSAGE} AS reactions,
         ${RECEIPTS_ON_MESSAGE} AS receipts,
         l.trigger AS line_trigger, l.fired_at, l.prompt, l.output
  FROM messages m
  JOIN events p ON p.seq = m.seq
  JOIN members a ON a.id = m.author_id
  LEFT JOIN trigger_lines l ON l.message_seq = m.seq`;

/** The trigger of a trigger's line, from the columns a query read of `trigger_lines`, or null for a message. */
export function lineOf(row: { line_trigger: string | null; fired_at: number | null; prompt: string | null; output: string | null }): TriggerLine | null {
  if (row.line_trigger === null) return null;
  return { name: row.line_trigger, firedAt: row.fired_at ?? 0, prompt: row.prompt ?? "", output: row.output };
}

const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  seq: row.seq,
  event: row.event_id,
  channelId: row.channel_id,
  threadId: row.thread_id,
  author: { id: row.author_id, kind: row.author_kind, name: row.author_name },
  text: row.text,
  attachments: [],
  sentAt: row.sent_at,
  editedAt: row.edited_at,
  deleted: row.deleted === 1,
  mentions: JSON.parse(row.mentions) as string[],
  reactions: JSON.parse(row.reactions) as Reaction[],
  trigger: lineOf(row),
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
  mentions: string[];
  /** The start of the text, for places that show only that. */
  preview: string;
  /** For a trigger's line, which has no text and mentions nobody, the trigger that fired. */
  trigger?: TriggerLine;
}

/** What an edit changes about a message. */
export interface MessageEdit {
  actorId: string;
  at: number;
  text: string;
  mentions: string[];
  preview: string;
}

/**
 * Every operation that changes a message writes the event that records the
 * change in the same transaction, and writes none when nothing would change.
 */
export interface MessageOperations {
  /**
   * Add a message to a thread, with its post event, or a trigger's line, with
   * its `fired` event. An archived thread is brought back by either, which
   * takes it to its next revision.
   */
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
    appendMessage(post) {
      const thread = sql.one("SELECT channel_id FROM threads WHERE id = ?", post.threadId) as
        | { channel_id: string }
        | undefined;
      if (thread === undefined) throw new Error(`Unknown thread ${post.threadId}`);
      const posted = appendEvent(
        sql,
        post.trigger === undefined
          ? { kind: "posted", channelId: thread.channel_id, actorId: post.authorId, at: post.sentAt, text: post.text, mentions: post.mentions }
          : { kind: "fired", channelId: thread.channel_id, actorId: post.authorId, at: post.sentAt },
      );
      sql.run(
        `INSERT INTO messages (seq, id, channel_id, thread_id, author_id, text, preview, sent_at, mentions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        posted.seq,
        newId("msg"),
        thread.channel_id,
        post.threadId,
        post.authorId,
        post.text,
        post.preview,
        post.sentAt,
        JSON.stringify(post.mentions),
      );
      if (post.trigger !== undefined) {
        const { name, firedAt, prompt, output } = post.trigger;
        sql.run(
          "INSERT INTO trigger_lines (message_seq, trigger, fired_at, prompt, output) VALUES (?, ?, ?, ?, ?)",
          posted.seq,
          name,
          firedAt,
          prompt,
          output,
        );
      }
      // A clock that steps back must not make a thread look older than it was. An archived thread comes back.
      sql.run(
        `UPDATE threads
         SET message_count = message_count + 1, last_seq = ?, updated_at = max(updated_at, ?),
             revision = revision + archived, archived = 0
         WHERE id = ?`,
        posted.seq,
        post.sentAt,
        post.threadId,
      );
      refreshPreview(sql, post.threadId);
      report({ kind: "event", channelId: thread.channel_id, threadId: post.threadId });
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
        mentions: edit.mentions,
      });
      sql.run(
        "UPDATE messages SET text = ?, preview = ?, mentions = ?, edited_at = ? WHERE seq = ?",
        edit.text,
        edit.preview,
        JSON.stringify(edit.mentions),
        edit.at,
        message.seq,
      );
      refreshPreview(sql, message.threadId);
      report({ kind: "event", channelId: message.channelId, threadId: message.threadId });
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
      report({ kind: "event", channelId: message.channelId, threadId: message.threadId });
      return loadMessage(sql, message.seq);
    },
  };
}
