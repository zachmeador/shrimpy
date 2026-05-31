import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { readMessages, type ChannelMessage } from "../channels/index.js";
import {
  resolveGatewayStatusConfig,
  type GatewayStatusConfig,
  type ResolvedWatchedScheduleStatusConfig,
} from "../config/index.js";
import { loadSchedulerState } from "../scheduler/index.js";

export interface ChannelMessageSnapshot {
  channel: string;
  message: ChannelMessage;
}

export interface GatewayActivitySummary {
  channelCount: number;
  lastScheduledRun?: ChannelMessageSnapshot;
  watchedSchedules: Record<string, GatewayWatchedScheduleActivity>;
  lastUserInteraction?: ChannelMessageSnapshot;
}

export interface GatewaySchedulerSummary {
  nextScheduledRun?: GatewayScheduledRunSchedulerStatus;
  watchedSchedules: Record<string, GatewayWatchedScheduleSchedulerStatus>;
}

export interface GatewayScheduledRunSchedulerStatus {
  scheduleId: string;
  nextRunAtMs: number;
}

export interface GatewayWatchedScheduleActivity {
  label: string;
  channel: string;
  scheduleId: string;
  lastRun?: ChannelMessageSnapshot;
}

export interface GatewayWatchedScheduleSchedulerStatus {
  label: string;
  channel: string;
  scheduleId: string;
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

function createWatchedScheduleActivity(
  watchedSchedules: ResolvedWatchedScheduleStatusConfig[],
): Record<string, GatewayWatchedScheduleActivity> {
  return Object.fromEntries(
    watchedSchedules.map((schedule) => [
      schedule.label,
      { ...schedule },
    ]),
  );
}

function systemPayloadScheduleId(message: ChannelMessage): string | undefined {
  if (message.content.type !== "system") return undefined;
  return typeof message.content.data.scheduleId === "string"
    ? message.content.data.scheduleId
    : undefined;
}

function messageScheduleId(message: ChannelMessage): string | undefined {
  return message.origin.scheduleId ?? systemPayloadScheduleId(message);
}

function isScheduledRun(
  message: ChannelMessage,
  scheduleIds?: ReadonlySet<string>,
): boolean {
  if (message.origin.transport !== "scheduler") return false;
  const scheduleId = messageScheduleId(message);
  if (!scheduleIds) return true;
  return scheduleId !== undefined && scheduleIds.has(scheduleId);
}

function isWatchedScheduledRun(
  channel: string,
  message: ChannelMessage,
  schedule: ResolvedWatchedScheduleStatusConfig,
): boolean {
  if (channel !== schedule.channel) return false;
  if (message.origin.transport !== "scheduler") return false;

  const originScheduleId = message.origin.scheduleId;
  const payloadScheduleId = systemPayloadScheduleId(message);

  if (
    originScheduleId !== schedule.scheduleId &&
    payloadScheduleId !== schedule.scheduleId
  ) {
    return false;
  }

  return true;
}

function isUserInteraction(
  message: ChannelMessage,
): boolean {
  return message.sender.kind === "human";
}

export function collectGatewayActivity(
  channelsDir: string,
  statusConfig?: GatewayStatusConfig,
  activeScheduleIds?: Iterable<string>,
): GatewayActivitySummary {
  const resolvedStatusConfig = resolveGatewayStatusConfig(statusConfig);
  const scheduleIds = activeScheduleIds
    ? new Set(activeScheduleIds)
    : undefined;
  const summary: GatewayActivitySummary = {
    channelCount: 0,
    watchedSchedules: createWatchedScheduleActivity(
      resolvedStatusConfig.watchedSchedules,
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

      if (isScheduledRun(message, scheduleIds)) {
        summary.lastScheduledRun = latest(summary.lastScheduledRun, snapshot);
      }

      for (const schedule of resolvedStatusConfig.watchedSchedules) {
        if (!isWatchedScheduledRun(channel, message, schedule)) continue;
        const watched = summary.watchedSchedules[schedule.label];
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

export function loadGatewaySchedulerSummary(
  schedulerStatePath: string,
  statusConfig?: GatewayStatusConfig,
  activeScheduleIds?: Iterable<string>,
): GatewaySchedulerSummary {
  const resolvedStatusConfig = resolveGatewayStatusConfig(statusConfig);
  const state = loadSchedulerState(schedulerStatePath);
  const scheduleIds = activeScheduleIds ? new Set(activeScheduleIds) : undefined;
  const nextScheduledRun = Object.entries(state)
    .filter(([scheduleId]) =>
      !scheduleIds || scheduleIds.has(scheduleId)
    )
    .filter(([, entry]) => typeof entry.nextRunAtMs === "number")
    .map(([scheduleId, entry]) => ({
      scheduleId,
      nextRunAtMs: entry.nextRunAtMs!,
    }))
    .sort((a, b) => a.nextRunAtMs - b.nextRunAtMs)[0];

  return {
    nextScheduledRun,
    watchedSchedules: Object.fromEntries(
      resolvedStatusConfig.watchedSchedules.map((schedule) => [
        schedule.label,
        {
          ...schedule,
          nextRunAtMs: state[schedule.scheduleId]?.nextRunAtMs,
        },
      ]),
    ),
  };
}
