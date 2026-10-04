import type { Receipt } from "../../contracts/chat/index.ts";
import { newId } from "../../lib/ids/index.ts";
import type { Sql } from "./sql.ts";

/** What goes into the log. A post names no message: it makes the one that takes its position. */
export type NewEvent =
  | { kind: "posted"; channelId: string; actorId: string; at: number; text: string }
  | { kind: "edited"; channelId: string; targetSeq: number; actorId: string; at: number; text: string }
  | { kind: "deleted"; channelId: string; targetSeq: number; actorId: string; at: number }
  | { kind: "reacted" | "unreacted"; channelId: string; targetSeq: number; actorId: string; at: number; emoji: string }
  | {
      kind: "receipted";
      channelId: string;
      /** The message that the event it answers names. */
      targetSeq: number;
      /** The agent that left the receipt. */
      actorId: string;
      at: number;
      /** The position of the event it answers. */
      answers: number;
      status: Receipt["status"];
      /** The position of the message that answers it, when the status is `answered`. */
      replySeq: number | null;
      detail: string | null;
    };

/**
 * Add an event to the log, and say where it landed. Only the store's own
 * operations call this, each in the transaction that makes the change the event
 * records, so no change to a message goes unrecorded.
 */
export function appendEvent(sql: Sql, event: NewEvent): { seq: number; id: string } {
  const id = newId("evt");
  const inserted = sql.one(
    `INSERT INTO events (id, kind, channel_id, target_seq, actor_id, at, text, emoji, answers_seq, status, reply_seq, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
    id,
    event.kind,
    event.channelId,
    "targetSeq" in event ? event.targetSeq : null,
    event.actorId,
    event.at,
    "text" in event ? event.text : null,
    "emoji" in event ? event.emoji : null,
    "answers" in event ? event.answers : null,
    "status" in event ? event.status : null,
    "replySeq" in event ? event.replySeq : null,
    "detail" in event ? event.detail : null,
  ) as { seq: number };
  return { seq: inserted.seq, id };
}
