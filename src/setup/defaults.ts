import type { GatewayStatusConfig } from "../config/index.js";
import type { WatchDefinition } from "../watches/schema.js";

const DEFAULT_WATCH_MAINTENANCE_CHANNEL = "maintenance";

export function createDefaultStatusConfig(): GatewayStatusConfig {
  return {};
}

export function createMemoryManagementWatch(opts?: {
  watchId?: string;
  channel?: string;
}): WatchDefinition {
  return {
    id: opts?.watchId ?? "memory-management",
    name: "Memory management",
    enabled: false,
    trigger: {
      kind: "time",
      cron: "0 3 * * *",
    },
    concurrencyPolicy: "forbid",
    action: {
      kind: "message",
      channel: opts?.channel ?? DEFAULT_WATCH_MAINTENANCE_CHANNEL,
      text: [
        "Use the `memory-management` skill.",
        "Review recent channel activity, update my own context files only when durable memory is warranted, and prune stale notes as I go.",
        "If there is nothing worth writing, report a no-op.",
      ].join(" "),
    },
  };
}

export function createJournalDailyWatch(opts?: {
  watchId?: string;
  channel?: string;
}): WatchDefinition {
  return {
    id: opts?.watchId ?? "journal-daily",
    name: "Daily journal",
    enabled: false,
    trigger: {
      kind: "time",
      cron: "30 22 * * *",
    },
    concurrencyPolicy: "forbid",
    action: {
      kind: "message",
      channel: opts?.channel ?? DEFAULT_WATCH_MAINTENANCE_CHANNEL,
      text: [
        "Use the `journal-daily` skill.",
        "If today had activity worth remembering, write today's short journal note.",
        "Do not backfill or overwrite prior days.",
      ].join(" "),
    },
  };
}

export function createJournalCompactWatch(opts?: {
  watchId?: string;
  channel?: string;
}): WatchDefinition {
  return {
    id: opts?.watchId ?? "journal-compact",
    name: "Journal compaction",
    enabled: false,
    trigger: {
      kind: "time",
      cron: "0 4 * * 0",
    },
    concurrencyPolicy: "forbid",
    action: {
      kind: "message",
      channel: opts?.channel ?? DEFAULT_WATCH_MAINTENANCE_CHANNEL,
      text: [
        "Use the `journal-compact` skill.",
        "Compact old journal day/week notes according to the skill's date limits.",
        "Only delete source files after the replacement summary exists.",
      ].join(" "),
    },
  };
}

export function createDefaultShrimpyWatches(): WatchDefinition[] {
  return [
    createMemoryManagementWatch(),
    createJournalDailyWatch(),
    createJournalCompactWatch(),
  ];
}

export function createSecurityAuditWatch(opts?: {
  watchId?: string;
  channel?: string;
}): WatchDefinition {
  return {
    id: opts?.watchId ?? "security-audit",
    name: "Security audit",
    enabled: false,
    trigger: {
      kind: "time",
      cron: "0 5 * * 1",
    },
    concurrencyPolicy: "forbid",
    action: {
      kind: "message",
      channel: opts?.channel ?? DEFAULT_WATCH_MAINTENANCE_CHANNEL,
      text: [
        "Use the `security-audit` skill.",
        "Run a read-only security posture review and write the report under agents/mechanic/vault/audits/.",
        "Do not change workspace state.",
      ].join(" "),
    },
  };
}

export function createHygieneAuditWatch(opts?: {
  watchId?: string;
  channel?: string;
}): WatchDefinition {
  return {
    id: opts?.watchId ?? "hygiene-audit",
    name: "Hygiene audit",
    enabled: false,
    trigger: {
      kind: "time",
      cron: "0 5 * * 5",
    },
    concurrencyPolicy: "forbid",
    action: {
      kind: "message",
      channel: opts?.channel ?? DEFAULT_WATCH_MAINTENANCE_CHANNEL,
      text: [
        "Use the `hygiene-audit` skill.",
        "Run a read-only workspace hygiene review and write the report under agents/mechanic/vault/audits/.",
        "Do not change workspace state.",
      ].join(" "),
    },
  };
}

export function createDefaultMechanicWatches(): WatchDefinition[] {
  return [
    createSecurityAuditWatch(),
    createHygieneAuditWatch(),
  ];
}
