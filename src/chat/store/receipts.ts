import type { Message, Receipt } from "../../contracts/chat/index.ts";
import type { ReportChange } from "./changes.ts";
import type { Sql } from "./sql.ts";

/**
 * The receipts on the message that the query calls `m`, as a JSON array in
 * order of member ID. A reply is named by its message's ID, not its position.
 */
export const RECEIPTS_ON_MESSAGE = `
  (SELECT json_group_array(
            json_object('memberId', member_id, 'status', status, 'reply', reply_id, 'detail', detail))
     FROM (SELECT r.member_id, r.status, a.id AS reply_id, r.detail
             FROM receipts r LEFT JOIN messages a ON a.seq = r.reply_seq
            WHERE r.message_seq = m.seq
            ORDER BY r.member_id))`;

export const parseReceipts = (json: string): Receipt[] => JSON.parse(json) as Receipt[];

/** What an agent left on a message, apart from who left it. */
export interface NewReceipt {
  status: Receipt["status"];
  /** The message that answers it, when the status is `answered`. */
  reply: Message | null;
  detail: string | null;
}

export interface ReceiptOperations {
  /**
   * Leave `memberId`'s receipt on a message, in place of the one it left
   * before. Leaving the receipt it already has changes nothing and tells nobody.
   */
  leaveReceipt(message: Message, memberId: string, receipt: NewReceipt): void;
}

export function receiptOperations(sql: Sql, report: ReportChange): ReceiptOperations {
  return {
    leaveReceipt(message, memberId, receipt) {
      const changed = sql.run(
        `INSERT INTO receipts (message_seq, member_id, status, reply_seq, detail)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (message_seq, member_id) DO UPDATE
           SET status = excluded.status, reply_seq = excluded.reply_seq, detail = excluded.detail
           WHERE receipts.status IS NOT excluded.status
              OR receipts.reply_seq IS NOT excluded.reply_seq
              OR receipts.detail IS NOT excluded.detail`,
        message.seq,
        memberId,
        receipt.status,
        receipt.reply?.seq ?? null,
        receipt.detail,
      );
      if (changed > 0) report({ kind: "thread", threadId: message.threadId });
    },
  };
}
