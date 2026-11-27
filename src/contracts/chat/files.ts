import { PIECE_BYTES, type Upload } from "./shapes.ts";

/** A file to send: the name and media type it goes with, and its bytes. */
export type FileToSend = { name: string; mediaType: string; bytes: Uint8Array };

/** The calls sending a file takes, however a caller makes them: each answers or throws. */
export interface FileSender {
  upload(file: { name: string; mediaType: string; size: number }, request: string): Promise<Upload>;
  uploadPiece(attachment: string, offset: number, data: Uint8Array): Promise<number>;
}

/**
 * Send a file to chat in pieces, carrying on from what chat has, and answer
 * with the attachment it is to be, for a post to name. Sending it again with
 * the same request ID sends only what chat lacks.
 */
export async function sendFile(sender: FileSender, file: FileToSend, request: string): Promise<string> {
  const { bytes } = file;
  const upload = await sender.upload({ name: file.name, mediaType: file.mediaType, size: bytes.byteLength }, request);
  let { received } = upload;
  while (received < bytes.byteLength) {
    received = await sender.uploadPiece(upload.attachment, received, bytes.subarray(received, received + PIECE_BYTES));
  }
  return upload.attachment;
}

/** The bytes of an attachment of `size` bytes, read in pieces with `read`, which answers or throws. */
export async function fetchFile(size: number, read: (offset: number, length: number) => Promise<Uint8Array>): Promise<Uint8Array> {
  const bytes = new Uint8Array(size);
  let at = 0;
  while (at < size) {
    const piece = await read(at, Math.min(PIECE_BYTES, size - at));
    if (piece.byteLength === 0) throw new Error(`Chat had ${at} of the ${size} bytes of the file.`);
    bytes.set(piece.subarray(0, size - at), at);
    at += piece.byteLength;
  }
  return bytes;
}
