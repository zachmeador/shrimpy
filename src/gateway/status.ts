import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { readMessages, type ChannelMessage } from "../channels/index.js";
import {
  resolveGatewayStatusConfig,
  type GatewayStatusConfig,
  type ResolvedWatchedWatchStatusConfig,
} from "../config/index.js";
import { loadWatchClockState } from "../watches/index.js";

export interface ChannelMessageSnapshot {
  channel: string;
  message: ChannelMessage;
}

interface GatewayActivitySummary {
  channelCount: number;
  lastWatchRun?: ChannelMessageSnapshot;
  watchedWatches: Record<string, GatewayWatchedWatchActivity>;
  lastUserInteraction?: ChannelMessageSnapshot;
}

interface GatewayWatchClockSummary {
  nextWatchRun?: GatewayWatchRunClockStatus;
  watchedWatches: Record<string, GatewayWatchedWatchClockStatus>;
}

interface GatewayWatchRunClockStatus {
  watchId: string;
  nextRunAtMs: number;
}

interface GatewayWatchedWatchActivity {
  label: string;
  channel: string;
  watchId: string;
  lastRun?: ChannelMessageSnapshot;
}

interface GatewayWatchedWatchClockStatus {
  label: string;
  channel: string;
  watchId: string;
  nextRunAtMs?: number;
}

function latest(
  current: ChannelMessageSnapshot | undefined,
  candidate: ChannelMessageSnapshot,
): ChannelMessageSnapshot {
  if (!current) return candidate;
  if (candidate.message.timestamp > current.message.timestamp) return candidate;
  return current;
}

function createWatchedWatchActivity(
  watchedWatches: ResolvedWatchedWatchStatusConfig[],
): Record<string, GatewayWatchedWatchActivity> {
  return Object.fromEntries(
    watchedWatches.map((watch) => [
      watch.label,
      { ...watch },
    ]),
  );
}

function isWatchRun(
  message: ChannelMessage,
  watchIds?: ReadonlySet<string>,
): boolean {
  if (message.origin.transport !== "watch") return false;
  if (!watchIds) return true;
  return message.origin.watchId !== undefined && watchIds.has(message.origin.watchId);
}

function isWatchedWatchRun(
  channel: string,
  message: ChannelMessage,
  watch: ResolvedWatchedWatchStatusConfig,
): boolean {
  if (channel !== watch.channel) return false;
  if (message.origin.transport !== "watch") return false;
  return message.origin.watchId === watch.watchId;
}

function isUserInteraction(
  message: ChannelMessage,
): boolean {
  return message.sender.kind === "human";
}

export function collectGatewayActivity(
  channelsDir: string,
  statusConfig?: GatewayStatusConfig,
  activeWatchIds?: Iterable<string>,
): GatewayActivitySummary {
  const resolvedStatusConfig = resolveGatewayStatusConfig(statusConfig);
  const watchIds = activeWatchIds
    ? new Set(activeWatchIds)
    : undefined;
  const summary: GatewayActivitySummary = {
    channelCount: 0,
    watchedWatches: createWatchedWatchActivity(
      resolvedStatusConfig.watchedWatches,
    ),
  };

  if (!existsSync(channelsDir)) return summary;

  const files = readdirSync(channelsDir)
    .filter((file) => file.endsWith(".jsonl"))
    .sort();
  summary.channelCount = files.length;

  for (const file of files) {
    const channel = basename(file, ".jsonl");
    const path = join(channelsDir, file);
    const { messages } = readMessages(path);

    for (const message of messages) {
      const snapshot = { channel, message };

      if (isWatchRun(message, watchIds)) {
        summary.lastWatchRun = latest(summary.lastWatchRun, snapshot);
      }

      for (const watch of resolvedStatusConfig.watchedWatches) {
        if (!isWatchedWatchRun(channel, message, watch)) continue;
        const watched = summary.watchedWatches[watch.label];
        watched.lastRun = latest(watched.lastRun, snapshot);
      }

      if (isUserInteraction(message)) {
        summary.lastUserInteraction = latest(
          summary.lastUserInteraction,
          snapshot,
        );
      }
    }
  }

  return summary;
}

export function loadGatewayWatchClockSummary(
  watchClockStatePath: string,
  statusConfig?: GatewayStatusConfig,
  activeWatchIds?: Iterable<string>,
): GatewayWatchClockSummary {
  const resolvedStatusConfig = resolveGatewayStatusConfig(statusConfig);
  const state = loadWatchClockState(watchClockStatePath);
  const watchIds = activeWatchIds ? new Set(activeWatchIds) : undefined;
  const nextWatchRun = Object.entries(state)
    .filter(([watchId]) =>
      !watchIds || watchIds.has(watchId)
    )
    .filter(([, entry]) => typeof entry.nextRunAtMs === "number")
    .map(([watchId, entry]) => ({
      watchId,
      nextRunAtMs: entry.nextRunAtMs!,
    }))
    .sort((a, b) => a.nextRunAtMs - b.nextRunAtMs)[0];

  return {
    nextWatchRun,
    watchedWatches: Object.fromEntries(
      resolvedStatusConfig.watchedWatches.map((watch) => [
        watch.label,
        {
          ...watch,
          nextRunAtMs: state[watch.watchId]?.nextRunAtMs,
        },
      ]),
    ),
  };
}
