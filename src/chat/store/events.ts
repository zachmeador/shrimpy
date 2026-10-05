import type { ChatEvent, Member, Receipt } from "../../contracts/chat/index.ts";
import { parseReceipts, RECEIPTS_ON_EVENT } from "./receipts.ts";
import type { Sql } from "./sql.ts";

type EventRow = {
  seq: number;
  id: string;
  kind: ChatEvent["kind"];
  at: number;
  text: string | null;
  emoji: string | null;
  /** The ID of the event a receipt answers. */
  answers_id: string | null;
  status: Receipt["status"] | null;
  /** The ID of the message that answers it. */
  reply_id: string | null;
  detail: string | null;
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
  SELECT e.seq, e.id, e.kind, e.at, e.text, e.emoji, e.status, e.detail,
         answered.id AS answers_id, replied.id AS reply_id,
         x.id AS actor_id, x.kind AS actor_kind, x.name AS actor_name,
         m.id AS message_id, m.channel_id, m.thread_id, m.sent_at, m.addressed, m.deleted, m.preview,
         a.id AS author_id, a.kind AS author_kind, a.name AS author_name,
         ${RECEIPTS_ON_EVENT} AS receipts
  FROM events e
  JOIN members x ON x.id = e.actor_id
  JOIN messages m ON m.seq = e.message_seq
  JOIN members a ON a.id = m.author_id
  LEFT JOIN events answered ON answered.seq = e.answers_seq
  LEFT JOIN messages replied ON replied.seq = e.reply_seq`;

/** A column that the table's checks say a kind of event always has. */
function stored<T>(row: EventRow, column: string, value: T | null): T {
  if (value === null) throw new Error(`Event ${row.id} has no ${column}`);
  return value;
}

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
    case "receipted":
      return {
        ...base,
        kind: row.kind,
        event: stored(row, "event it answers", row.answers_id),
        status: stored(row, "status", row.status),
        reply: row.reply_id,
        detail: row.detail,
      };
  }
}

export interface EventOperations {
  /** The event with this ID, if there is one. */
  event(id: string): ChatEvent | undefined;
  /**
   * Up to `limit` events after `cursor` in the channels a member belongs to;
   * oldest first. In each channel, only those after the member joined it.
   */
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
         WHERE e.seq > ?
           AND EXISTS (SELECT 1 FROM memberships s
                        WHERE s.channel_id = e.channel_id AND s.member_id = ? AND s.since_seq < e.seq)
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
