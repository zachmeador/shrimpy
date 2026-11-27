import type { Attachment } from "../../contracts/chat/index.ts";
import { newId } from "../../lib/ids/index.ts";
import type { Sql } from "./sql.ts";

/** A file as chat keeps it: what a message shows of it, who sent it, how much of it has come, and the message it went with, if any. */
export interface AttachmentRecord extends Attachment {
  ownerId: string;
  received: number;
  /** The message it went with, and that message's thread, or null while it is its sender's upload. */
  messageSeq: number | null;
  threadId: string | null;
}

type AttachmentRow = {
  id: string;
  owner_id: string;
  name: string;
  media_type: string;
  size: number;
  received: number;
  width: number | null;
  height: number | null;
  message_seq: number | null;
  thread_id: string | null;
};

const toRecord = (row: AttachmentRow): AttachmentRecord => ({
  id: row.id,
  name: row.name,
  mediaType: row.media_type,
  size: row.size,
  width: row.width,
  height: row.height,
  ownerId: row.owner_id,
  received: row.received,
  messageSeq: row.message_seq,
  threadId: row.thread_id,
});

/** The files of the message the query calls `m`, as a JSON array of attachments in their order. */
export const ATTACHMENTS_OF_MESSAGE = `
  (SELECT json_group_array(json_object('id', f.id, 'name', f.name, 'mediaType', f.media_type, 'size', f.size,
                                       'width', f.width, 'height', f.height) ORDER BY f.position)
     FROM attachments f
    WHERE f.message_seq = m.seq)`;

export const parseAttachments = (json: string): Attachment[] => JSON.parse(json) as Attachment[];

export interface NewUpload {
  ownerId: string;
  requestId: string;
  name: string;
  mediaType: string;
  size: number;
  at: number;
}

export interface AttachmentOperations {
  /** Start an upload, or find the one the sender started with this request ID. */
  startUpload(upload: NewUpload): AttachmentRecord;
  /** The upload a sender started with this request ID, if there is one. */
  uploadFor(ownerId: string, requestId: string): AttachmentRecord | undefined;
  attachment(id: string): AttachmentRecord | undefined;
  /** Keep the bytes of a piece that starts where what has come ends, and say how much has come now. */
  addPiece(id: string, data: Uint8Array): number;
  /** Say what picture a file is, once its bytes show it. */
  setPicture(id: string, picture: { mediaType: string; width: number; height: number }): void;
  /** Up to `length` of a file's bytes from `from`, fewer at its end. */
  bytesOf(id: string, from: number, length: number): Uint8Array;
  /** Make uploads a message's files, in the order given. */
  attachTo(messageSeq: number, ids: readonly string[]): void;
  /** Let go of a message's files, bytes and all. */
  dropFilesOf(messageSeq: number): void;
  /** Let go of the uploads started before `before` that no message took, bytes and all. */
  dropUploadsBefore(before: number): void;
}

const SELECT = `
  SELECT f.id, f.owner_id, f.name, f.media_type, f.size, f.received, f.width, f.height, f.message_seq, m.thread_id
  FROM attachments f
  LEFT JOIN messages m ON m.seq = f.message_seq`;

export function attachmentOperations(sql: Sql): AttachmentOperations {
  const one = (where: string, ...params: (string | number)[]): AttachmentRecord | undefined => {
    const row = sql.one(`${SELECT} ${where}`, ...params) as AttachmentRow | undefined;
    return row === undefined ? undefined : toRecord(row);
  };
  const drop = (where: string, ...params: number[]): void => {
    sql.run(`DELETE FROM attachment_pieces WHERE attachment_id IN (SELECT id FROM attachments ${where})`, ...params);
    sql.run(`DELETE FROM attachments ${where}`, ...params);
  };
  return {
    startUpload(upload) {
      const found = one("WHERE f.owner_id = ? AND f.request_id = ?", upload.ownerId, upload.requestId);
      if (found !== undefined) return found;
      const id = newId("att");
      sql.run(
        `INSERT INTO attachments (id, owner_id, request_id, name, media_type, size, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        upload.ownerId,
        upload.requestId,
        upload.name,
        upload.mediaType,
        upload.size,
        upload.at,
      );
      const made = one("WHERE f.id = ?", id);
      if (made === undefined) throw new Error(`Upload ${id} was not stored`);
      return made;
    },
    uploadFor: (ownerId, requestId) => one("WHERE f.owner_id = ? AND f.request_id = ?", ownerId, requestId),
    attachment: (id) => one("WHERE f.id = ?", id),
    addPiece(id, data) {
      const found = one("WHERE f.id = ?", id);
      if (found === undefined) throw new Error(`Unknown upload ${id}`);
      if (found.received + data.byteLength > found.size) throw new Error(`Upload ${id} is ${found.size} bytes, and this piece goes past its end`);
      sql.run("INSERT INTO attachment_pieces (attachment_id, start, data) VALUES (?, ?, ?)", id, found.received, data);
      sql.run("UPDATE attachments SET received = received + ? WHERE id = ?", data.byteLength, id);
      return found.received + data.byteLength;
    },
    setPicture(id, { mediaType, width, height }) {
      sql.run("UPDATE attachments SET media_type = ?, width = ?, height = ? WHERE id = ?", mediaType, width, height, id);
    },
    bytesOf(id, from, length) {
      const end = from + length;
      const pieces = sql.all(
        `SELECT start, data FROM attachment_pieces
          WHERE attachment_id = ? AND start < ? AND start + length(data) > ?
          ORDER BY start`,
        id,
        end,
        from,
      ) as { start: number; data: Uint8Array }[];
      const parts = pieces.map(({ start, data }) => data.subarray(Math.max(0, from - start), Math.min(data.byteLength, end - start)));
      const bytes = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
      let at = 0;
      for (const part of parts) {
        bytes.set(part, at);
        at += part.byteLength;
      }
      return bytes;
    },
    attachTo(messageSeq, ids) {
      for (const [position, id] of ids.entries()) {
        sql.run("UPDATE attachments SET message_seq = ?, position = ? WHERE id = ?", messageSeq, position, id);
      }
    },
    dropFilesOf: (messageSeq) => drop("WHERE message_seq = ?", messageSeq),
    dropUploadsBefore: (before) => drop("WHERE message_seq IS NULL AND created_at < ?", before),
  };
}
