import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import type { ToolExecutionApi } from "@earendil-works/pi-durable";
import { MAX_ATTACHED_BYTES, MAX_ATTACHMENTS, sendFile } from "../../contracts/chat/index.ts";
import { mediaTypeOf, why } from "../../lib/files/index.ts";
import { toolRequestId } from "../host/durable.ts";
import type { ChatCalls } from "../links/index.ts";
import * as words from "./words.ts";

/** A file the agent sent to chat: the attachment a post names, and its name and size. */
export type Sent = { attachment: string; name: string; size: number };

/** What sending files for a tool call takes. */
export interface Sending {
  chat: ChatCalls;
  home: string;
  recordsId: string;
  api: ToolExecutionApi;
  signal: AbortSignal;
}

/**
 * Send the files at `paths`, in the home or anywhere the agent can read, to
 * chat for a post, each once for this tool call, as `kind`'s files. Each is
 * looked at first, so nothing is sent when one isn't there, is empty, or would
 * take the files past what a message carries. A link that drops throws.
 */
export async function sendFiles(sending: Sending, paths: readonly string[], kind: string): Promise<{ sent: Sent[] } | { problem: string }> {
  if (paths.length > MAX_ATTACHMENTS) return { problem: words.tooManyFiles(paths.length) };
  const files: { path: string; name: string; size: number }[] = [];
  for (const given of paths) {
    const path = given.startsWith("~/") ? resolve(homedir(), given.slice(2)) : resolve(sending.home, given);
    try {
      const found = await stat(path);
      if (!found.isFile()) return { problem: words.notAFile(given) };
      if (found.size === 0) return { problem: words.emptyFile(given) };
      files.push({ path, name: basename(path), size: found.size });
    } catch (error) {
      return { problem: words.unreadableFile(given, why(error)) };
    }
  }
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_ATTACHED_BYTES) return { problem: words.tooBig(total) };

  const sent: Sent[] = [];
  for (const [index, file] of files.entries()) {
    let bytes: Buffer;
    try {
      bytes = await readFile(file.path);
    } catch (error) {
      return { problem: words.unreadableFile(file.path, why(error)) };
    }
    const attachment = await sendFile(
      {
        upload: (upload, request) => sending.chat.upload(upload, request, sending.signal),
        uploadPiece: (id, offset, data) => sending.chat.uploadPiece(id, offset, data, sending.signal),
      },
      { name: file.name, mediaType: mediaTypeOf(file.name), bytes: new Uint8Array(bytes) },
      toolRequestId(`${kind}-file`, sending.recordsId, sending.api, index),
    );
    sent.push({ attachment, name: file.name, size: bytes.byteLength });
  }
  return { sent };
}
