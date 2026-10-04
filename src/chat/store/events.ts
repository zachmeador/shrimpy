import type { ChatEvent, Member } from "../../contracts/chat/index.ts";
import { newId } from "../../lib/ids/index.ts";
import { parseReceipts, RECEIPTS_ON_EVENT } from "./receipts.ts";
import type { Sql } from "./sql.ts";

type EventRow = {
  seq: number;
  id: string;
  kind: ChatEvent["kind"];
  at: number;
  text: string | null;
  emoji: string | null;
  actor_id: string;
  actor_kind: Member["kind"];
  actor_name: string;
  message_id: string;
  channel_id: string;
  thread_id: string;
  sent_at: number;
  addressed: string;
  deleted: number;
  preview: string;
  author_id: string;
  author_kind: Member["kind"];
  author_name: string;
  receipts: string;
};

const SELECT = `
  SELECT e.seq, e.id, e.kind, e.at, e.text, e.emoji,
         x.id AS actor_id, x.kind AS actor_kind, x.name AS actor_name,
         m.id AS message_id, m.channel_id, m.thread_id, m.sent_at, m.addressed, m.deleted, m.preview,
         a.id AS author_id, a.kind AS author_kind, a.name AS author_name,
         ${RECEIPTS_ON_EVENT} AS receipts
  FROM events e
  JOIN members x ON x.id = e.actor_id
  JOIN messages m ON m.seq = e.message_seq
  JOIN members a ON a.id = m.author_id`;

function toEvent(row: EventRow): ChatEvent {
  const base = {
    id: row.id,
    seq: row.seq,
    at: row.at,
    actor: { id: row.actor_id, kind: row.actor_kind, name: row.actor_name },
    message: {
      id: row.message_id,
      channelId: row.channel_id,
      threadId: row.thread_id,
      author: { id: row.author_id, kind: row.author_kind, name: row.author_name },
      sentAt: row.sent_at,
      addressed: JSON.parse(row.addressed) as string[],
      deleted: row.deleted === 1,
      preview: row.preview,
    },
    receipts: parseReceipts(row.receipts),
  };
  switch (row.kind) {
    case "posted":
    case "edited":
      return { ...base, kind: row.kind, text: row.text ?? "" };
    case "deleted":
      return { ...base, kind: row.kind };
    case "reacted":
    case "unreacted":
      return { ...base, kind: row.kind, emoji: row.emoji ?? "" };
  }
}

/** What goes into the log. A post names no message: it makes the one that takes its position. */
export type NewEvent =
  | { kind: "posted"; channelId: string; actorId: string; at: number; text: string }
  | { kind: "edited"; channelId: string; targetSeq: number; actorId: string; at: number; text: string }
  | { kind: "deleted"; channelId: string; targetSeq: number; actorId: string; at: number }
  | { kind: "reacted" | "unreacted"; channelId: string; targetSeq: number; actorId: string; at: number; emoji: string };

/**
 * Add an event to the log, and say where it landed. Only the store's own
 * operations call this, each in the transaction that makes the change the event
 * records, so no change to a message goes unrecorded.
 */
export function appendEvent(sql: Sql, event: NewEvent): { seq: number; id: string } {
  const id = newId("evt");
  const inserted = sql.one(
    `INSERT INTO events (id, kind, channel_id, target_seq, actor_id, at, text, emoji)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
    id,
    event.kind,
    event.channelId,
    "targetSeq" in event ? event.targetSeq : null,
    event.actorId,
    event.at,
    "text" in event ? event.text : null,
    "emoji" in event ? event.emoji : null,
  ) as { seq: number };
  return { seq: inserted.seq, id };
}

export interface EventOperations {
  /** The event with this ID, if there is one. */
  event(id: string): ChatEvent | undefined;
  /** Up to `limit` events after `cursor` in the channels a member belongs to; oldest first. */
  eventsAfter(memberId: string, cursor: number, limit: number): ChatEvent[];
  /** The position of the newest event, or 0 while there are none. */
  head(): number;
}

export function eventOperations(sql: Sql): EventOperations {
  return {
    event(id) {
      const row = sql.one(`${SELECT} WHERE e.id = ?`, id) as EventRow | undefined;
      return row === undefined ? undefined : toEvent(row);
    },
    eventsAfter(memberId, cursor, limit) {
      const rows = sql.all(
        `${SELECT}
         WHERE e.seq > ? AND e.channel_id IN (SELECT channel_id FROM memberships WHERE member_id = ?)
         ORDER BY e.seq LIMIT ?`,
        cursor,
        memberId,
        limit,
      ) as EventRow[];
      return rows.map(toEvent);
    },
    head() {
      const row = sql.one("SELECT coalesce(max(seq), 0) AS head FROM events") as { head: number };
      return row.head;
    },
  };
}
