import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import type { ParseError } from "../shared/types.js";

const MAX_JSONL_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export interface JsonlReadResult {
  events: unknown[];
  parseErrors: ParseError[];
  truncated: boolean;
  totalSize: number;
  cursor: number;
  anchor: string;
  replace: boolean;
}

export async function readJsonl(
  path: string,
  requestedCursor?: number,
  requestedAnchor?: string,
): Promise<JsonlReadResult> {
  const stat = await fs.stat(path);
  const cursorCandidate = Number.isSafeInteger(requestedCursor)
    && requestedCursor! >= 0
    && requestedCursor! <= stat.size;
  const handle = await fs.open(path, "r");

  try {
    const continuing = cursorCandidate
      && typeof requestedAnchor === "string"
      && await anchorAt(handle, requestedCursor!) === requestedAnchor;
    let start = continuing
      ? requestedCursor!
      : Math.max(0, stat.size - MAX_JSONL_BYTES);
    const truncated = !continuing && start > 0;
    const length = Math.min(stat.size - start, MAX_JSONL_BYTES);
    const buffer = Buffer.alloc(length);
    const read = await handle.read(buffer, 0, length, start);
    let chunk = buffer.subarray(0, read.bytesRead);

    if (!continuing && start > 0) {
      const firstNewline = chunk.indexOf(0x0a);
      if (firstNewline === -1) {
        return {
          events: [],
          parseErrors: [],
          truncated: true,
          totalSize: stat.size,
          cursor: start + chunk.length,
          anchor: await anchorAt(handle, start + chunk.length),
          replace: true,
        };
      }
      start += firstNewline + 1;
      chunk = chunk.subarray(firstNewline + 1);
    }

    const finalNewline = chunk.lastIndexOf(0x0a);
    const complete = finalNewline === -1
      ? Buffer.alloc(0)
      : chunk.subarray(0, finalNewline + 1);
    const cursor = start + complete.length;
    const events: unknown[] = [];
    const parseErrors: ParseError[] = [];
    const lines = complete.toString("utf8").split(/\r?\n/);

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]?.trim();
      if (!line) continue;
      try {
        events.push(JSON.parse(line) as unknown);
      } catch (error) {
        parseErrors.push({
          line: index + 1,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      events,
      parseErrors,
      truncated,
      totalSize: stat.size,
      cursor,
      anchor: await anchorAt(handle, cursor),
      replace: !continuing,
    };
  } finally {
    await handle.close();
  }
}

async function anchorAt(
  handle: Awaited<ReturnType<typeof fs.open>>,
  cursor: number,
): Promise<string> {
  const length = Math.min(cursor, 64);
  const buffer = Buffer.alloc(length);
  if (length > 0) await handle.read(buffer, 0, length, cursor - length);
  return createHash("sha256").update(buffer).digest("base64url").slice(0, 16);
}

export async function readText(path: string): Promise<{
  text: string;
  truncated: boolean;
  totalSize: number;
}> {
  const stat = await fs.stat(path);
  const length = Math.min(stat.size, MAX_TEXT_BYTES);
  const handle = await fs.open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const read = await handle.read(buffer, 0, length, 0);
    return {
      text: buffer.subarray(0, read.bytesRead).toString("utf8"),
      truncated: stat.size > MAX_TEXT_BYTES,
      totalSize: stat.size,
    };
  } finally {
    await handle.close();
  }
}
