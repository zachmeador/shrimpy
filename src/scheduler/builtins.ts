import type { AgentScheduleDefinition } from "./schema.js";
import { renderHeartbeatScheduleInstructions } from "../context/turn/scheduler.js";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_MAINTENANCE_CHANNEL = "heartbeat";

export function createHeartbeatSchedule(opts?: {
  intervalMs?: number;
  scheduleId?: string;
  channel?: string;
}): AgentScheduleDefinition {
  const intervalMs = opts?.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

  return {
    id: opts?.scheduleId ?? "heartbeat",
    name: "Built-in heartbeat",
    enabled: true,
    trigger: {
      type: "every_ms",
      everyMs: intervalMs,
    },
    concurrencyPolicy: "forbid",
    channel: opts?.channel ?? DEFAULT_MAINTENANCE_CHANNEL,
    instructions: renderHeartbeatScheduleInstructions(),
  };
}

export function createMemoryManagementSchedule(opts?: {
  scheduleId?: string;
  channel?: string;
}): AgentScheduleDefinition {
  return {
    id: opts?.scheduleId ?? "memory-management",
    name: "Memory management",
    enabled: true,
    trigger: {
      type: "cron",
      expression: "0 3 * * *",
    },
    concurrencyPolicy: "forbid",
    channel: opts?.channel ?? DEFAULT_MAINTENANCE_CHANNEL,
    instructions: [
      "Use the `memory-management` skill.",
      "Review recent channel activity, update my own context files only when durable memory is warranted, and prune stale notes as I go.",
      "If there is nothing worth writing, report a no-op.",
    ].join(" "),
  };
}

export function createJournalDailySchedule(opts?: {
  scheduleId?: string;
  channel?: string;
}): AgentScheduleDefinition {
  return {
    id: opts?.scheduleId ?? "journal-daily",
    name: "Daily journal",
    enabled: true,
    trigger: {
      type: "cron",
      expression: "30 22 * * *",
    },
    concurrencyPolicy: "forbid",
    channel: opts?.channel ?? DEFAULT_MAINTENANCE_CHANNEL,
    instructions: [
      "Use the `journal-daily` skill.",
      "If today had activity worth remembering, write today's short journal note.",
      "Do not backfill or overwrite prior days.",
    ].join(" "),
  };
}

export function createJournalCompactSchedule(opts?: {
  scheduleId?: string;
  channel?: string;
}): AgentScheduleDefinition {
  return {
    id: opts?.scheduleId ?? "journal-compact",
    name: "Journal compaction",
    enabled: true,
    trigger: {
      type: "cron",
      expression: "0 4 * * 0",
    },
    concurrencyPolicy: "forbid",
    channel: opts?.channel ?? DEFAULT_MAINTENANCE_CHANNEL,
    instructions: [
      "Use the `journal-compact` skill.",
      "Compact old journal day/week notes according to the skill's date limits.",
      "Only delete source files after the replacement summary exists.",
    ].join(" "),
  };
}

export function createDefaultShrimpySchedules(): AgentScheduleDefinition[] {
  return [
    createHeartbeatSchedule(),
    createMemoryManagementSchedule(),
    createJournalDailySchedule(),
    createJournalCompactSchedule(),
  ];
}
