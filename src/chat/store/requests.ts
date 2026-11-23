import type { Message } from "../../contracts/chat/index.ts";
import { loadMessage } from "./messages.ts";
import type { Sql } from "./sql.ts";

/** The requests members made of messages, each by the member's own ID for it, kept for good. */
export interface RequestOperations {
  /** The message that `memberId`'s request `requestId` posted or changed, as it now stands, with the digest of what the request said. */
  requested(memberId: string, requestId: string): { message: Message; digest: string } | undefined;
  /** Keep `memberId`'s request `requestId`, which posted or changed the message at `messageSeq`. Its ID must be new. */
  keepRequest(memberId: string, requestId: string, messageSeq: number, digest: string): void;
}

export function requestOperations(sql: Sql): RequestOperations {
  return {
    requested(memberId, requestId) {
      const row = sql.one("SELECT message_seq, digest FROM requests WHERE member_id = ? AND request_id = ?", memberId, requestId) as
        | { message_seq: number; digest: string }
        | undefined;
      return row === undefined ? undefined : { message: loadMessage(sql, row.message_seq), digest: row.digest };
    },
    keepRequest(memberId, requestId, messageSeq, digest) {
      sql.run("INSERT INTO requests (member_id, request_id, message_seq, digest) VALUES (?, ?, ?, ?)", memberId, requestId, messageSeq, digest);
    },
  };
}
