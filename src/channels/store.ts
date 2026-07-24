/**
 * Channel storage — JSONL append/read/watch with byte-offset cursors.
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  statSync,
  watch,
} from "node:fs";
import { basename, join } from "node:path";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import { isRecord } from "../util/record.js";
import {
  isChannelMessage,
  type ChannelMessage,
} from "./protocol.js";
import { parseChannelName } from "./names.js";

export interface ChannelCursor {
  byteOffset: number;
}

export interface ReadResult {
  messages: ChannelMessage[];
  cursor: ChannelCursor;
}

export type ChannelCallback = (
  channel: string,
  messages: ChannelMessage[],
) => void;

export interface ChannelWatcher {
  stop(): void;
  getCursors(): Record<string, ChannelCursor>;
}

export function appendMessage(
  channelPath: string,
  message: ChannelMessage,
): number {
  const dir = join(channelPath, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const line = JSON.stringify(message) + "\n";
  appendFileSync(channelPath, line, "utf-8");

  return statSync(channelPath).size;
}

export function readMessages(
  channelPath: string,
  cursor?: ChannelCursor,
): ReadResult {
  if (!existsSync(channelPath)) {
    return { messages: [], cursor: { byteOffset: 0 } };
  }

  const stat = statSync(channelPath);
  const requestedOffset = cursor?.byteOffset ?? 0;
  const offset = requestedOffset > stat.size ? 0 : requestedOffset;

  if (stat.size <= offset) {
    return { messages: [], cursor: { byteOffset: offset } };
  }

  const length = stat.size - offset;
  const buf = Buffer.alloc(length);
  const fd = openSync(channelPath, "r");
  try {
    readSync(fd, buf, 0, length, offset);
  } finally {
    closeSync(fd);
  }

  const text = buf.toString("utf-8");
  const lines = text.split("\n");

  const messages: ChannelMessage[] = [];
  let bytesConsumed = 0;

  for (const [i, line] of lines.entries()) {
    const lineBytes = Buffer.byteLength(line, "utf-8") + (i < lines.length - 1 ? 1 : 0);

    if (line.trim() === "") {
      bytesConsumed += lineBytes;
      continue;
    }

    try {
      const parsed: unknown = JSON.parse(line);
      if (isChannelMessage(parsed)) {
        messages.push(parsed);
      }
      bytesConsumed += lineBytes;
    } catch {
      if (offset > 0 && i === 0) {
        bytesConsumed += lineBytes;
        continue;
      }
      break;
    }
  }

  return {
    messages,
    cursor: { byteOffset: offset + bytesConsumed },
  };
}

export function loadCursors(
  cursorsPath: string,
): Record<string, ChannelCursor> {
  return readJsonFile(cursorsPath, () => ({}), (raw) => {
    if (!isRecord(raw)) return {};

    const cursors: Record<string, ChannelCursor> = {};
    for (const [channel, value] of Object.entries(raw)) {
      if (!isRecord(value)) continue;
      if (typeof value.byteOffset !== "number") continue;
      cursors[channel] = { byteOffset: value.byteOffset };
    }
    return cursors;
  });
}

export function saveCursors(
  cursorsPath: string,
  cursors: Record<string, ChannelCursor>,
): void {
  writeJsonFileAtomic(cursorsPath, cursors);
}

export function watchChannels(
  channelsDir: string,
  callback: ChannelCallback,
  cursors?: Record<string, ChannelCursor>,
): ChannelWatcher {
  if (!existsSync(channelsDir)) mkdirSync(channelsDir, { recursive: true });

  const offsets = new Map<string, number>();
  if (cursors) {
    for (const [channel, cursor] of Object.entries(cursors)) {
      offsets.set(channel, cursor.byteOffset);
    }
  }

  function processChannel(channel: string) {
    const filePath = join(channelsDir, `${channel}.jsonl`);
    if (!existsSync(filePath)) return;

    const currentOffset = offsets.get(channel) ?? 0;
    const { messages, cursor } = readMessages(filePath, {
      byteOffset: currentOffset,
    });

    if (messages.length > 0) {
      offsets.set(channel, cursor.byteOffset);
      callback(channel, messages);
    }
  }

  const watcher = watch(channelsDir, (_eventType, filename) => {
    if (!filename || !filename.endsWith(".jsonl")) return;
    const channel = basename(filename, ".jsonl");
    processChannel(channel);
  });

  for (const file of readdirSync(channelsDir)) {
    if (!file.endsWith(".jsonl")) continue;
    const channel = basename(file, ".jsonl");
    processChannel(channel);
  }

  return {
    stop() {
      watcher.close();
    },
    getCursors() {
      const result: Record<string, ChannelCursor> = {};
      for (const [channel, byteOffset] of offsets) {
        result[channel] = { byteOffset };
      }
      return result;
    },
  };
}

export function drainBacklog(
  channelsDir: string,
  cursors: Record<string, ChannelCursor>,
  callback: ChannelCallback,
): Record<string, ChannelCursor> {
  if (!existsSync(channelsDir)) return cursors;

  const updated = { ...cursors };

  for (const file of readdirSync(channelsDir)) {
    if (!file.endsWith(".jsonl")) continue;
    const channel = basename(file, ".jsonl");
    const filePath = join(channelsDir, `${channel}.jsonl`);
    const cursor = updated[channel] ?? { byteOffset: 0 };

    const { messages, cursor: newCursor } = readMessages(filePath, cursor);
    if (messages.length > 0) {
      callback(channel, messages);
    }
    updated[channel] = newCursor;
  }

  return updated;
}

export function currentChannelCursors(
  channelsDir: string,
): Record<string, ChannelCursor> {
  if (!existsSync(channelsDir)) return {};

  const cursors: Record<string, ChannelCursor> = {};
  for (const file of readdirSync(channelsDir)) {
    if (!file.endsWith(".jsonl")) continue;
    const channel = basename(file, ".jsonl");
    cursors[channel] = {
      byteOffset: statSync(join(channelsDir, file)).size,
    };
  }
  return cursors;
}

export function channelPath(channelsDir: string, channel: string): string {
  const name = parseChannelName(channel);
  return join(channelsDir, `${name}.jsonl`);
}

export class ChannelStore {
  constructor(readonly channelsDir: string) {}

  path(channel: string): string {
    return channelPath(this.channelsDir, channel);
  }

  append(channel: string, message: ChannelMessage): number {
    return appendMessage(this.path(channel), message);
  }

  read(channel: string, cursor?: ChannelCursor): ReadResult {
    return readMessages(this.path(channel), cursor);
  }

  watch(
    callback: ChannelCallback,
    cursors?: Record<string, ChannelCursor>,
  ): ChannelWatcher {
    return watchChannels(this.channelsDir, callback, cursors);
  }

  drainBacklog(
    cursors: Record<string, ChannelCursor>,
    callback: ChannelCallback,
  ): Record<string, ChannelCursor> {
    return drainBacklog(this.channelsDir, cursors, callback);
  }

  currentCursors(): Record<string, ChannelCursor> {
    return currentChannelCursors(this.channelsDir);
  }
}
