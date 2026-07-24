import { join } from "node:path";
import type { AppRuntime } from "../../app/runtime.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../../util/json-file.js";
import type { TurnContextItem } from "./types.js";

export interface ContextTurnProducerState {
  lastRunAt?: number;
  items?: TurnContextItem[];
}

export interface ContextState {
  channels: Record<string, { lastSeenMessageId?: string }>;
  producers: Record<string, ContextTurnProducerState>;
}

export function contextTurnProducerStateKey(
  producerId: string,
  channel: string | undefined,
  sessionType: string,
): string {
  return JSON.stringify([producerId, channel ?? null, sessionType]);
}

function emptyState(): ContextState {
  return {
    channels: {},
    producers: {},
  };
}

function parseState(raw: unknown): ContextState {
  const parsed = typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const channels = typeof parsed.channels === "object" && parsed.channels !== null
      && !Array.isArray(parsed.channels)
    ? parsed.channels as Record<string, unknown>
    : {};
  const producers = typeof parsed.producers === "object" && parsed.producers !== null
      && !Array.isArray(parsed.producers)
    ? parsed.producers as Record<string, unknown>
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
    producers: Object.fromEntries(
      Object.entries(producers).map(([id, value]) => {
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

export function contextStatePath(runtime: AppRuntime, agentId: string): string {
  return join(runtime.paths.runtimeContextDir, `${agentId}.json`);
}

export function readContextState(
  runtime: AppRuntime,
  agentId: string,
): ContextState {
  return readJsonFile(
    contextStatePath(runtime, agentId),
    emptyState,
    parseState,
  );
}

export function writeContextState(
  runtime: AppRuntime,
  agentId: string,
  state: ContextState,
): void {
  writeJsonFileAtomic(contextStatePath(runtime, agentId), state);
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
  const state = readContextState(runtime, agentId);
  state.channels[channel] = { lastSeenMessageId: messageId };
  writeContextState(runtime, agentId, state);
}
