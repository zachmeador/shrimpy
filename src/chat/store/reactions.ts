import type { Message } from "../../contracts/chat/index.ts";
import { appendEvent } from "./append.ts";
import type { ReportChange } from "./changes.ts";
import { loadMessage } from "./messages.ts";
import type { Sql } from "./sql.ts";

/**
 * Like a message's other changes, a reaction is written with the event that
 * records it, and nothing is written when nothing would change.
 */
export interface ReactionOperations {
  /** Put an emoji on a message as a member. A message it is already on stays as it is. It must not be deleted. */
  addReaction(message: Message, memberId: string, emoji: string, at: number): Message;
  /** Take a member's emoji off a message. A message without it stays as it is. */
  removeReaction(message: Message, memberId: string, emoji: string, at: number): Message;
}

export function reactionOperations(sql: Sql, report: ReportChange): ReactionOperations {
  const has = (message: Message, memberId: string, emoji: string): boolean =>
    message.reactions.some((reaction) => reaction.emoji === emoji && reaction.memberIds.includes(memberId));
  return {
    addReaction(message, memberId, emoji, at) {
      if (message.deleted) throw new Error(`Message ${message.id} is deleted and takes no reactions`);
      if (has(message, memberId, emoji)) return message;
      const event = appendEvent(sql, {
        kind: "reacted",
        channelId: message.channelId,
        targetSeq: message.seq,
        actorId: memberId,
        at,
        emoji,
      });
      sql.run(
        "INSERT INTO reactions (message_seq, member_id, emoji, event_seq) VALUES (?, ?, ?, ?)",
        message.seq,
        memberId,
        emoji,
        event.seq,
      );
      report({ kind: "event", threadId: message.threadId });
      return loadMessage(sql, message.seq);
    },
    removeReaction(message, memberId, emoji, at) {
      if (!has(message, memberId, emoji)) return message;
      appendEvent(sql, {
        kind: "unreacted",
        channelId: message.channelId,
        targetSeq: message.seq,
        actorId: memberId,
        at,
        emoji,
      });
      sql.run(
        "DELETE FROM reactions WHERE message_seq = ? AND member_id = ? AND emoji = ?",
        message.seq,
        memberId,
        emoji,
      );
      report({ kind: "event", threadId: message.threadId });
      return loadMessage(sql, message.seq);
    },
  };
}
