import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { readMessages, type ChannelMessage } from "../channels/index.js";
import {
  resolveGatewayStatusConfig,
  type GatewayStatusConfig,
} from "../config/index.js";
import { loadSchedulerState } from "../scheduler/index.js";

export interface ChannelMessageSnapshot {
  channel: string;
  message: ChannelMessage;
}

export interface GatewayActivitySummary {
  channelCount: number;
  lastHeartbeat?: ChannelMessageSnapshot;
  lastUserInteraction?: ChannelMessageSnapshot;
}

export interface GatewaySchedulerSummary {
  nextHeartbeatAtMs?: number;
}

function latest(
  current: ChannelMessageSnapshot | undefined,
  candidate: ChannelMessageSnapshot,
): ChannelMessageSnapshot {
  if (!current) return candidate;
  if (candidate.message.timestamp > current.message.timestamp) return candidate;
  return current;
}

function isScheduledHeartbeat(
  channel: string,
  message: ChannelMessage,
  heartbeatChannel: string,
  heartbeatScheduleId: string,
): boolean {
  if (channel !== heartbeatChannel) return false;
  if (message.sender.kind !== "system") return false;
  if (message.content.type !== "system") return false;
  if (message.origin.transport !== "scheduler") return false;

  if (message.content.data.trigger !== "scheduled") return false;

  const originScheduleId = message.origin.scheduleId;
  const payloadScheduleId =
    typeof message.content.data.scheduleId === "string"
      ? message.content.data.scheduleId
      : undefined;

  if (
    originScheduleId !== heartbeatScheduleId &&
    payloadScheduleId !== heartbeatScheduleId
  ) {
    return false;
  }

  return true;
}

function isUserInteraction(
  channel: string,
  message: ChannelMessage,
  heartbeatChannel: string,
): boolean {
  if (channel === heartbeatChannel) return false;
  return message.sender.kind === "human";
}

export function collectGatewayActivity(
  channelsDir: string,
  statusConfig?: GatewayStatusConfig,
): GatewayActivitySummary {
  const resolvedStatusConfig = resolveGatewayStatusConfig(statusConfig);
  const summary: GatewayActivitySummary = {
    channelCount: 0,
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

      if (
        isScheduledHeartbeat(
          channel,
          message,
          resolvedStatusConfig.heartbeatChannel,
          resolvedStatusConfig.heartbeatScheduleId,
        )
      ) {
        summary.lastHeartbeat = latest(summary.lastHeartbeat, snapshot);
      }

      if (
        isUserInteraction(
          channel,
          message,
          resolvedStatusConfig.heartbeatChannel,
        )
      ) {
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
): GatewaySchedulerSummary {
  const resolvedStatusConfig = resolveGatewayStatusConfig(statusConfig);
  const state = loadSchedulerState(schedulerStatePath);
  return {
    nextHeartbeatAtMs:
      state[resolvedStatusConfig.heartbeatScheduleId]?.nextRunAtMs,
  };
}
