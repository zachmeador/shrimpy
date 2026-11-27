import { type Member, PIECE_BYTES, type Upload } from "../../contracts/chat/index.ts";
import { pictureOf } from "../../lib/pictures/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { sizeWords } from "../../lib/text/index.ts";
import { fileName, fileSize, identifier, mediaType, piece, whole } from "../input/index.ts";
import type { AttachmentRecord, Transaction } from "../store/index.ts";
import { readsThread } from "./access.ts";
import type { ChatDeps } from "./deps.ts";

/** How long chat holds an upload that no post has taken: a day. */
const UPLOAD_KEPT_MS = 24 * 60 * 60 * 1000;

/**
 * Start an upload for the caller, once for each request ID: a retry answers
 * with the same upload and how much of it has come. Uploads older than a day
 * that no post took are let go first.
 */
export function upload(deps: ChatDeps, caller: Member, name: unknown, type: unknown, size: unknown, requestId: unknown): Upload {
  const file = fileName(name);
  const media = mediaType(type);
  const bytes = fileSize(size);
  const request = identifier(requestId, "request");
  return deps.store.transaction((tx) => {
    const now = deps.now();
    tx.dropUploadsBefore(now - UPLOAD_KEPT_MS);
    const found = tx.uploadFor(caller.id, request);
    if (found !== undefined && (found.name !== file || found.size !== bytes)) refuse(`Request ${request} was used before for something else.`);
    const kept = found ?? tx.startUpload({ ownerId: caller.id, requestId: request, name: file, mediaType: media, size: bytes, at: now });
    return { attachment: kept.id, received: kept.received };
  });
}

/**
 * Keep a piece of one of the caller's uploads, skipping the part of it that
 * has come already, and say how much has come. Once all of it has, a picture
 * is known by its bytes and given its media type, width and height.
 */
export function uploadPiece(deps: ChatDeps, caller: Member, attachment: unknown, offset: unknown, data: unknown): number {
  const id = identifier(attachment, "attachment");
  const from = whole(offset, "offset", 0);
  const bytes = piece(data);
  return deps.store.transaction((tx) => {
    const found = ownUpload(tx, caller, id);
    if (from > found.received) refuse(`Chat has ${found.received} bytes of ${id}, so the next piece starts there, not at ${from}.`);
    const fresh = bytes.subarray(Math.min(bytes.byteLength, found.received - from));
    if (fresh.byteLength === 0) return found.received;
    if (found.received + fresh.byteLength > found.size) refuse(`${found.name} is ${found.size} bytes, and this piece goes past its end.`);
    const received = tx.addPiece(id, fresh);
    if (received === found.size) {
      const picture = pictureOf(tx.bytesOf(id, 0, PIECE_BYTES));
      if (picture !== undefined) tx.setPicture(id, picture);
    }
    return received;
  });
}

/** Up to `length` bytes of a file the caller reads, from `offset`, and at most `PIECE_BYTES`. */
export function download(deps: ChatDeps, caller: Member, attachment: unknown, offset: unknown, length: unknown): Uint8Array {
  const id = identifier(attachment, "attachment");
  const from = whole(offset, "offset", 0);
  const most = Math.min(whole(length, "length", 1), PIECE_BYTES);
  return deps.store.transaction((tx) => {
    const found = tx.attachment(id);
    const reads =
      found !== undefined &&
      (found.threadId === null ? found.ownerId === caller.id : readsThread(tx, deps, caller, found.threadId));
    if (!reads) refuse(`Unknown attachment: ${id}`);
    if (from >= found.received) return new Uint8Array(0);
    return tx.bytesOf(id, from, Math.min(most, found.received - from));
  });
}

/**
 * The caller's finished uploads that a post names, in order, which no message
 * has taken yet.
 */
export function finishedUploads(tx: Transaction, caller: Member, ids: readonly string[]): AttachmentRecord[] {
  return ids.map((id) => {
    const found = ownUpload(tx, caller, id);
    if (found.received < found.size) {
      refuse(`Chat has ${sizeWords(found.received)} of the ${sizeWords(found.size)} in ${found.name}. Send the rest before posting it.`);
    }
    return found;
  });
}

/** One of the caller's uploads that no message has taken. To anyone else, it isn't there. */
function ownUpload(tx: Transaction, caller: Member, id: string): AttachmentRecord {
  const found = tx.attachment(id);
  if (found === undefined || found.ownerId !== caller.id || found.messageSeq !== null) refuse(`Unknown upload: ${id}`);
  return found;
}
