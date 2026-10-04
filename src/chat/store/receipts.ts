import type { ChatEvent, Message, Receipt } from "../../contracts/chat/index.ts";
import type { ReportChange } from "./changes.ts";
import type { Sql } from "./sql.ts";

/**
 * The receipts on the event that the query calls `e`, as a JSON array in order
 * of member ID. A reply is named by its message's ID, not its position.
 */
export const RECEIPTS_ON_EVENT = `
  (SELECT json_group_array(
            json_object('memberId', r.member_id, 'event', e.id, 'status', r.status, 'reply', reply.id, 'detail', r.detail)
            ORDER BY r.member_id)
     FROM receipts r
     LEFT JOIN messages reply ON reply.seq = r.reply_seq
    WHERE r.event_seq = e.seq)`;

/**
 * The receipts on every event that names the message that the query calls `m`,
 * as a JSON array in order of event and then of member ID.
 */
export const RECEIPTS_ON_MESSAGE = `
  (SELECT json_group_array(
            json_object('memberId', r.member_id, 'event', v.id, 'status', r.status, 'reply', reply.id, 'detail', r.detail)
            ORDER BY r.event_seq, r.member_id)
     FROM receipts r
     JOIN events v ON v.seq = r.event_seq
     LEFT JOIN messages reply ON reply.seq = r.reply_seq
    WHERE v.message_seq = m.seq)`;

export const parseReceipts = (json: string): Receipt[] => JSON.parse(json) as Receipt[];

/** What an agent left on an event, apart from who left it. */
export interface NewReceipt {
  status: Receipt["status"];
  /** The message that answers it, when the status is `answered`. */
  reply: Message | null;
  detail: string | null;
}

export interface ReceiptOperations {
  /**
   * Leave `memberId`'s receipt on an event, in place of the one it left
   * before. Leaving the receipt it already has changes nothing and tells nobody.
   */
  leaveReceipt(event: ChatEvent, memberId: string, receipt: NewReceipt): void;
}

export function receiptOperations(sql: Sql, report: ReportChange): ReceiptOperations {
  return {
    leaveReceipt(event, memberId, receipt) {
      const changed = sql.run(
        `INSERT INTO receipts (event_seq, member_id, status, reply_seq, detail)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (event_seq, member_id) DO UPDATE
           SET status = excluded.status, reply_seq = excluded.reply_seq, detail = excluded.detail
           WHERE receipts.status IS NOT excluded.status
              OR receipts.reply_seq IS NOT excluded.reply_seq
              OR receipts.detail IS NOT excluded.detail`,
        event.seq,
        memberId,
        receipt.status,
        receipt.reply?.seq ?? null,
        receipt.detail,
      );
      if (changed > 0) report({ kind: "thread", threadId: event.message.threadId });
    },
  };
}
