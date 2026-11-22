import type { Message } from "../../contracts/chat/index.ts";
import type { ReportChange } from "./changes.ts";
import type { Sql } from "./sql.ts";

/**
 * For each thread the query picks, how many messages others wrote after the
 * read mark of the member bound first, or in the whole thread while it has
 * none, leaving out deleted ones. The member is bound twice: for its mark, and
 * to leave out its own messages.
 */
const UNREAD = `
  SELECT t.id AS thread_id, count(m.seq) AS unread
    FROM threads t
    LEFT JOIN read_marks r ON r.member_id = ? AND r.thread_id = t.id
    LEFT JOIN messages m ON m.thread_id = t.id AND m.seq > coalesce(r.message_seq, 0) AND m.author_id <> ? AND m.deleted = 0`;

/** A member's read marks: in each thread, the last message it has seen there. */
export interface MarkOperations {
  /**
   * Move a member's read mark in the message's thread up to that message. A
   * mark already there or past it stays as it is, and tells nobody.
   */
  markRead(memberId: string, message: Message): void;
  /** How many messages are new to a member in a thread: others wrote them after its mark, and they are not deleted. */
  unreadIn(memberId: string, threadId: string): number;
  /** How many messages are new to a member in each thread of a channel, by thread ID. */
  unreadInChannel(memberId: string, channelId: string): Record<string, number>;
}

export function markOperations(sql: Sql, report: ReportChange): MarkOperations {
  return {
    markRead(memberId, message) {
      const moved = sql.run(
        `INSERT INTO read_marks (member_id, thread_id, message_seq) VALUES (?, ?, ?)
         ON CONFLICT (member_id, thread_id) DO UPDATE SET message_seq = excluded.message_seq
           WHERE excluded.message_seq > read_marks.message_seq`,
        memberId,
        message.threadId,
        message.seq,
      );
      if (moved > 0) report({ kind: "read", memberId, channelId: message.channelId, threadId: message.threadId });
    },
    unreadIn(memberId, threadId) {
      const row = sql.one(`${UNREAD} WHERE t.id = ? GROUP BY t.id`, memberId, memberId, threadId) as { unread: number } | undefined;
      return row?.unread ?? 0;
    },
    unreadInChannel(memberId, channelId) {
      const rows = sql.all(`${UNREAD} WHERE t.channel_id = ? GROUP BY t.id`, memberId, memberId, channelId) as {
        thread_id: string;
        unread: number;
      }[];
      return Object.fromEntries(rows.map((row) => [row.thread_id, row.unread]));
    },
  };
}
