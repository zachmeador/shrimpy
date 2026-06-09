import { createReadStream, promises as fs } from "node:fs";
import { createInterface } from "node:readline";

export interface ParseError {
  line: number;
  error: string;
}

export interface JsonlReadResult {
  events: unknown[];
  parseErrors: ParseError[];
  truncated: boolean;
  totalSize: number;
}

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export async function readJsonl(path: string): Promise<JsonlReadResult> {
  const st = await fs.stat(path);
  const truncated = st.size > MAX_BYTES;

  const events: unknown[] = [];
  const parseErrors: ParseError[] = [];

  const stream = createReadStream(path, {
    encoding: "utf8",
    end: truncated ? MAX_BYTES : undefined,
  });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNo = 0;
  for await (const raw of rl) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch (err) {
      parseErrors.push({
        line: lineNo,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (truncated && events.length > 0) {
    events.pop();
  }

  return { events, parseErrors, truncated, totalSize: st.size };
}

export interface TextReadResult {
  text: string;
  truncated: boolean;
  totalSize: number;
}

export async function readText(path: string): Promise<TextReadResult> {
  const st = await fs.stat(path);
  const truncated = st.size > MAX_TEXT_BYTES;
  const handle = await fs.open(path, "r");
  try {
    const buffer = Buffer.alloc(Math.min(st.size, MAX_TEXT_BYTES));
    const read = await handle.read(buffer, 0, buffer.length, 0);
    return {
      text: buffer.subarray(0, read.bytesRead).toString("utf8"),
      truncated,
      totalSize: st.size,
    };
  } finally {
    await handle.close();
  }
}
