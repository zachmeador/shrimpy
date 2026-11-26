import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/** Maximum lines kept when reading a process log tail by default. */
export const DEFAULT_TAIL_LINES = 100;
/** Maximum lines kept for a sync command result (matches Pi's bash default). */
export const MAX_SYNC_LINES = 2000;
/** Maximum bytes kept for a sync command or process read tail (50 KB). */
export const MAX_TAIL_BYTES = 50 * 1024;
/** Maximum bytes kept in a wake line or wakeup prompt output tail. */
export const MAX_WAKE_TAIL_BYTES = 16 * 1024;
/** Maximum lines kept in a wakeup prompt output tail. */
export const MAX_WAKE_TAIL_LINES = 120;
/** How many finished log files to keep on disk under `state/processes/`. */
const MAX_KEPT_LOGS = 50;

/** Open a new process log file under `dir` and return its path and writable fd. */
export function openProcessLog(dir: string, id: string): { logPath: string; fd: number } {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const logPath = join(dir, `${id}.log`);
  const fd = openSync(logPath, "a", 0o600);
  return { logPath, fd };
}

/** Remove a process log file if it exists, ignoring missing-file errors. */
export function removeProcessLog(logPath: string): void {
  try {
    unlinkSync(logPath);
  } catch {
    // Ignore already removed files.
  }
}

/** Read new bytes written to `logPath` starting at byte `offset`, returning the decoded text and new offset. */
export function readLogDelta(logPath: string, offset: number): { text: string; offset: number } {
  let fd: number;
  try {
    fd = openSync(logPath, "r");
  } catch {
    return { text: "", offset };
  }
  try {
    const size = statSync(logPath).size;
    if (size <= offset) return { text: "", offset };
    const length = size - offset;
    const buf = Buffer.allocUnsafe(length);
    const bytesRead = readSync(fd, buf, 0, length, offset);
    return { text: buf.subarray(0, bytesRead).toString("utf8"), offset: offset + bytesRead };
  } finally {
    closeSync(fd);
  }
}

/** Read the tail of `logPath`, bounded by both `maxLines` and `maxBytes`. */
export function readLogTail(
  logPath: string,
  options: { maxLines?: number; maxBytes?: number } = {},
): { output: string; truncated: boolean } {
  const maxLines = options.maxLines ?? DEFAULT_TAIL_LINES;
  const maxBytes = options.maxBytes ?? MAX_TAIL_BYTES;
  if (!existsSync(logPath)) return { output: "", truncated: false };

  let fd: number;
  try {
    fd = openSync(logPath, "r");
  } catch {
    return { output: "", truncated: false };
  }
  try {
    const size = statSync(logPath).size;
    if (size === 0) return { output: "", truncated: false };
    const start = Math.max(0, size - maxBytes);
    let truncated = start > 0;
    const length = size - start;
    const buf = Buffer.allocUnsafe(length);
    const bytesRead = readSync(fd, buf, 0, length, start);
    let text = buf.subarray(0, bytesRead).toString("utf8");
    // If we sliced mid-line from the middle of the file, drop the partial leading line.
    if (truncated) {
      const nl = text.indexOf("\n");
      if (nl !== -1) text = text.slice(nl + 1);
    }
    const lines = text.split("\n");
    // Preserve trailing newline without treating the empty trailing element as an extra line.
    const trailingNewline = lines.at(-1) === "";
    const body = trailingNewline ? lines.slice(0, -1) : lines;
    if (body.length > maxLines) {
      truncated = true;
      const sliced = body.slice(body.length - maxLines);
      text = trailingNewline ? `${sliced.join("\n")}\n` : sliced.join("\n");
    }
    return { output: text, truncated };
  } finally {
    closeSync(fd);
  }
}

/** Prune old finished process logs in `dir`, keeping all active IDs and the newest `MAX_KEPT_LOGS` finished logs. */
export function pruneProcessLogs(dir: string, activeIds: ReadonlySet<string>): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  const finished: { path: string; mtimeMs: number }[] = [];
  for (const name of names) {
    if (!name.endsWith(".log")) continue;
    const id = name.slice(0, -".log".length);
    if (activeIds.has(id)) continue;
    const full = join(dir, name);
    try {
      finished.push({ path: full, mtimeMs: statSync(full).mtimeMs });
    } catch {
      // Ignore vanished files.
    }
  }
  if (finished.length <= MAX_KEPT_LOGS) return;
  finished.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const old of finished.slice(MAX_KEPT_LOGS)) removeProcessLog(old.path);
}
