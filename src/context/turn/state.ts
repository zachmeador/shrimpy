import { join } from "node:path";
import type { AppRuntime } from "../../app/runtime.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../../util/json-file.js";
import type { TurnContextItem } from "./types.js";

export interface BriefingState {
  channels: Record<string, { lastSeenMessageId?: string }>;
  commands: Record<string, {
    lastRunAt?: number;
    items?: TurnContextItem[];
  }>;
}

function emptyState(): BriefingState {
  return {
    channels: {},
    commands: {},
  };
}

function parseState(raw: unknown): BriefingState {
  const parsed = typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const channels = typeof parsed.channels === "object" && parsed.channels !== null
      && !Array.isArray(parsed.channels)
    ? parsed.channels as Record<string, unknown>
    : {};
  const commands = typeof parsed.commands === "object" && parsed.commands !== null
      && !Array.isArray(parsed.commands)
    ? parsed.commands as Record<string, unknown>
    : {};

  return {
    channels: Object.fromEntries(
      Object.entries(channels).map(([channel, value]) => {
        const obj = typeof value === "object" && value !== null && !Array.isArray(value)
          ? value as Record<string, unknown>
          : {};
        return [
          channel,
          {
            lastSeenMessageId: typeof obj.lastSeenMessageId === "string"
              ? obj.lastSeenMessageId
              : undefined,
          },
        ];
      }),
    ),
    commands: Object.fromEntries(
      Object.entries(commands).map(([id, value]) => {
        const obj = typeof value === "object" && value !== null && !Array.isArray(value)
          ? value as Record<string, unknown>
          : {};
        return [
          id,
          {
            lastRunAt: typeof obj.lastRunAt === "number" ? obj.lastRunAt : undefined,
            items: parseItems(obj.items),
          },
        ];
      }),
    ),
  };
}

export function briefingStatePath(runtime: AppRuntime, agentId: string): string {
  return join(runtime.paths.runtimeBriefingsDir, `${agentId}.json`);
}

export function readBriefingState(
  runtime: AppRuntime,
  agentId: string,
): BriefingState {
  return readJsonFile(
    briefingStatePath(runtime, agentId),
    emptyState,
    parseState,
  );
}

export function writeBriefingState(
  runtime: AppRuntime,
  agentId: string,
  state: BriefingState,
): void {
  writeJsonFileAtomic(briefingStatePath(runtime, agentId), state);
}

function parseItems(raw: unknown): TurnContextItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw.flatMap((item): TurnContextItem[] => {
    const obj = typeof item === "object" && item !== null && !Array.isArray(item)
      ? item as Record<string, unknown>
      : null;
    if (!obj || typeof obj.id !== "string" || typeof obj.summary !== "string") {
      return [];
    }
    return [{
      id: obj.id,
      summary: obj.summary,
      inspect: typeof obj.inspect === "string" ? obj.inspect : undefined,
    }];
  });
  return items;
}

export function markChannelSeen(
  runtime: AppRuntime,
  agentId: string,
  channel: string,
  messageId: string,
): void {
  const state = readBriefingState(runtime, agentId);
  state.channels[channel] = { lastSeenMessageId: messageId };
  writeBriefingState(runtime, agentId, state);
}
