import { existsSync } from "node:fs";
import type { MessageSenderKind } from "../channels/index.js";
import { readJsonFileStrict } from "../util/json-file.js";

export type ScheduleConcurrencyPolicy = "forbid" | "allow" | "replace";

export interface ScheduleRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs?: number;
}

export interface EveryMsTrigger {
  type: "every_ms";
  everyMs: number;
}

export interface CronTrigger {
  type: "cron";
  expression: string;
  timezone?: string;
}

export type ScheduleTrigger = EveryMsTrigger | CronTrigger;

export interface AgentChannelTarget {
  kind: "channel";
  channel: string;
  addressedAgentId?: string;
  senderKind?: MessageSenderKind;
  senderActorId?: string;
  senderUserId?: string;
  senderDisplayName?: string;
  contentType?: "system" | "text";
  contentData?: Record<string, unknown>;
}

export type AgentTarget = AgentChannelTarget;

export interface AgentScheduleAction {
  kind: "agent";
  target: AgentTarget;
}

export type ScheduleAction = AgentScheduleAction;

export interface ScheduleDefinition {
  id: string;
  name?: string;
  enabled?: boolean;
  timezone?: string;
  trigger: ScheduleTrigger;
  action: ScheduleAction;
  concurrencyPolicy?: ScheduleConcurrencyPolicy;
  retryPolicy?: ScheduleRetryPolicy;
}

export interface AgentScheduleDefinition {
  id: string;
  name?: string;
  enabled?: boolean;
  timezone?: string;
  trigger: ScheduleTrigger;
  channel: string;
  instructions: string;
  concurrencyPolicy?: ScheduleConcurrencyPolicy;
  retryPolicy?: ScheduleRetryPolicy;
}

export interface ResolvedAgentScheduleDefinition extends ScheduleDefinition {
  ownerAgentId: string;
  localId: string;
}

export interface ScheduleRunDue {
  schedule: ScheduleDefinition;
  scheduleId: string;
  runId: string;
  fireTimeMs: number;
  fireTimeIso: string;
  dedupeKey: string;
}

const CONCURRENCY_POLICIES = new Set<ScheduleConcurrencyPolicy>([
  "forbid",
  "allow",
  "replace",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseScheduleTrigger(raw: unknown, index: number): ScheduleTrigger {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    throw new Error(`schedules[${index}].trigger must be an object`);
  }

  if (raw.type === "every_ms") {
    if (typeof raw.everyMs !== "number" || !(raw.everyMs > 0)) {
      throw new Error(`schedules[${index}].trigger.everyMs must be > 0`);
    }
    return {
      type: "every_ms",
      everyMs: raw.everyMs,
    };
  }

  if (raw.type === "cron") {
    if (typeof raw.expression !== "string" || raw.expression.trim().length === 0) {
      throw new Error(
        `schedules[${index}].trigger.expression must be a non-empty string`,
      );
    }
    if (raw.timezone !== undefined && typeof raw.timezone !== "string") {
      throw new Error(`schedules[${index}].trigger.timezone must be a string`);
    }
    return {
      type: "cron",
      expression: raw.expression,
      timezone: raw.timezone,
    };
  }

  throw new Error(
    `schedules[${index}].trigger.type must be "every_ms" or "cron"`,
  );
}

function parseAgentTarget(raw: unknown, index: number): AgentTarget {
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    throw new Error(`schedules[${index}].action.target must be an object`);
  }

  if (raw.kind === "channel") {
    if (typeof raw.channel !== "string" || raw.channel.trim().length === 0) {
      throw new Error(
        `schedules[${index}].action.target.channel must be a non-empty string`,
      );
    }
    if (
      raw.addressedAgentId !== undefined &&
      typeof raw.addressedAgentId !== "string"
    ) {
      throw new Error(
        `schedules[${index}].action.target.addressedAgentId must be a string`,
      );
    }
    if (
      raw.senderKind !== undefined &&
      raw.senderKind !== "human" &&
      raw.senderKind !== "agent" &&
      raw.senderKind !== "system"
    ) {
      throw new Error(
        `schedules[${index}].action.target.senderKind must be "human" | "agent" | "system"`,
      );
    }
    if (raw.senderActorId !== undefined && typeof raw.senderActorId !== "string") {
      throw new Error(
        `schedules[${index}].action.target.senderActorId must be a string`,
      );
    }
    if (raw.senderUserId !== undefined && typeof raw.senderUserId !== "string") {
      throw new Error(
        `schedules[${index}].action.target.senderUserId must be a string`,
      );
    }
    if (
      raw.senderDisplayName !== undefined &&
      typeof raw.senderDisplayName !== "string"
    ) {
      throw new Error(
        `schedules[${index}].action.target.senderDisplayName must be a string`,
      );
    }
    if (
      raw.contentType !== undefined &&
      raw.contentType !== "system" &&
      raw.contentType !== "text"
    ) {
      throw new Error(
        `schedules[${index}].action.target.contentType must be "system" or "text"`,
      );
    }
    if (raw.contentData !== undefined && !isRecord(raw.contentData)) {
      throw new Error(
        `schedules[${index}].action.target.contentData must be an object`,
      );
    }
    if (
      raw.contentType === "text" &&
      (!isRecord(raw.contentData) || typeof raw.contentData.text !== "string")
    ) {
      throw new Error(
        `schedules[${index}].action.target.contentData.text must be a string when contentType is "text"`,
      );
    }

    return {
      kind: "channel",
      channel: raw.channel,
      addressedAgentId: raw.addressedAgentId,
      senderKind: raw.senderKind,
      senderActorId: raw.senderActorId,
      senderUserId: raw.senderUserId,
      senderDisplayName: raw.senderDisplayName,
      contentType: raw.contentType as "system" | "text" | undefined,
      contentData: raw.contentData,
    };
  }

  throw new Error(
    `schedules[${index}].action.target.kind must be "channel"`,
  );
}

function parseRetryPolicy(raw: unknown, index: number): ScheduleRetryPolicy | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    throw new Error(`schedules[${index}].retryPolicy must be an object`);
  }
  if (typeof raw.maxAttempts !== "number" || !(raw.maxAttempts > 0)) {
    throw new Error(`schedules[${index}].retryPolicy.maxAttempts must be > 0`);
  }
  if (typeof raw.backoffMs !== "number" || !(raw.backoffMs >= 0)) {
    throw new Error(`schedules[${index}].retryPolicy.backoffMs must be >= 0`);
  }
  if (
    raw.maxBackoffMs !== undefined &&
    (typeof raw.maxBackoffMs !== "number" || !(raw.maxBackoffMs >= 0))
  ) {
    throw new Error(`schedules[${index}].retryPolicy.maxBackoffMs must be >= 0`);
  }
  return {
    maxAttempts: raw.maxAttempts,
    backoffMs: raw.backoffMs,
    maxBackoffMs: raw.maxBackoffMs as number | undefined,
  };
}

function parseScheduleAction(raw: unknown, index: number): ScheduleAction {
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    throw new Error(`schedules[${index}].action must be an object`);
  }

  if (raw.kind === "agent") {
    return {
      kind: "agent",
      target: parseAgentTarget(raw.target, index),
    };
  }

  throw new Error(
    `schedules[${index}].action.kind must be "agent"`,
  );
}

function parseScheduleDefinition(
  raw: unknown,
  index: number,
): ScheduleDefinition {
  if (!isRecord(raw)) {
    throw new Error(`schedules[${index}] must be an object`);
  }

  if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
    throw new Error(`schedules[${index}].id must be a non-empty string`);
  }
  if (raw.name !== undefined && typeof raw.name !== "string") {
    throw new Error(`schedules[${index}].name must be a string`);
  }
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
    throw new Error(`schedules[${index}].enabled must be a boolean`);
  }
  if (raw.timezone !== undefined && typeof raw.timezone !== "string") {
    throw new Error(`schedules[${index}].timezone must be a string`);
  }
  if (
    raw.concurrencyPolicy !== undefined &&
    (typeof raw.concurrencyPolicy !== "string" ||
      !CONCURRENCY_POLICIES.has(
        raw.concurrencyPolicy as ScheduleConcurrencyPolicy,
      ))
  ) {
    throw new Error(
      `schedules[${index}].concurrencyPolicy must be one of: ${[...CONCURRENCY_POLICIES].join(", ")}`,
    );
  }

  return {
    id: raw.id,
    name: raw.name as string | undefined,
    enabled: raw.enabled as boolean | undefined,
    timezone: raw.timezone as string | undefined,
    trigger: parseScheduleTrigger(raw.trigger, index),
    action: parseScheduleAction(raw.action, index),
    concurrencyPolicy:
      raw.concurrencyPolicy as ScheduleConcurrencyPolicy | undefined,
    retryPolicy: parseRetryPolicy(raw.retryPolicy, index),
  };
}

function parseAgentScheduleDefinition(
  raw: unknown,
  index: number,
): AgentScheduleDefinition {
  if (!isRecord(raw)) {
    throw new Error(`schedules[${index}] must be an object`);
  }

  if (typeof raw.id !== "string" || raw.id.trim().length === 0) {
    throw new Error(`schedules[${index}].id must be a non-empty string`);
  }
  if (raw.name !== undefined && typeof raw.name !== "string") {
    throw new Error(`schedules[${index}].name must be a string`);
  }
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
    throw new Error(`schedules[${index}].enabled must be a boolean`);
  }
  if (raw.timezone !== undefined && typeof raw.timezone !== "string") {
    throw new Error(`schedules[${index}].timezone must be a string`);
  }
  if (typeof raw.channel !== "string" || raw.channel.trim().length === 0) {
    throw new Error(`schedules[${index}].channel must be a non-empty string`);
  }
  if (typeof raw.instructions !== "string" || raw.instructions.trim().length === 0) {
    throw new Error(`schedules[${index}].instructions must be a non-empty string`);
  }
  if (
    raw.concurrencyPolicy !== undefined &&
    (typeof raw.concurrencyPolicy !== "string" ||
      !CONCURRENCY_POLICIES.has(
        raw.concurrencyPolicy as ScheduleConcurrencyPolicy,
      ))
  ) {
    throw new Error(
      `schedules[${index}].concurrencyPolicy must be one of: ${[...CONCURRENCY_POLICIES].join(", ")}`,
    );
  }

  return {
    id: raw.id,
    name: raw.name as string | undefined,
    enabled: raw.enabled as boolean | undefined,
    timezone: raw.timezone as string | undefined,
    trigger: parseScheduleTrigger(raw.trigger, index),
    channel: raw.channel,
    instructions: raw.instructions,
    concurrencyPolicy:
      raw.concurrencyPolicy as ScheduleConcurrencyPolicy | undefined,
    retryPolicy: parseRetryPolicy(raw.retryPolicy, index),
  };
}

export function parseScheduleDefinitions(raw: unknown): ScheduleDefinition[] {
  if (!Array.isArray(raw)) {
    throw new Error("scheduler schedules file must be a JSON array");
  }

  const schedules = raw.map((item, index) =>
    parseScheduleDefinition(item, index),
  );
  const ids = new Set<string>();
  for (const schedule of schedules) {
    if (ids.has(schedule.id)) {
      throw new Error(`scheduler schedules contains duplicate id "${schedule.id}"`);
    }
    ids.add(schedule.id);
  }
  return schedules;
}

export function loadScheduleDefinitions(path: string): ScheduleDefinition[] {
  if (!existsSync(path)) return [];
  const raw = readJsonFileStrict(path, (parsed) => parsed);
  return parseScheduleDefinitions(raw);
}

export function parseAgentScheduleDefinitions(
  raw: unknown,
): AgentScheduleDefinition[] {
  if (!Array.isArray(raw)) {
    throw new Error("agent schedules file must be a JSON array");
  }

  const schedules = raw.map((item, index) =>
    parseAgentScheduleDefinition(item, index),
  );
  const ids = new Set<string>();
  for (const schedule of schedules) {
    if (ids.has(schedule.id)) {
      throw new Error(`agent schedules contains duplicate id "${schedule.id}"`);
    }
    ids.add(schedule.id);
  }
  return schedules;
}

export function loadAgentScheduleDefinitions(path: string): AgentScheduleDefinition[] {
  if (!existsSync(path)) return [];
  const raw = readJsonFileStrict(path, (parsed) => parsed);
  return parseAgentScheduleDefinitions(raw);
}

export function resolveAgentScheduleDefinition(
  agentId: string,
  schedule: AgentScheduleDefinition,
): ResolvedAgentScheduleDefinition {
  return {
    id: `${agentId}/${schedule.id}`,
    localId: schedule.id,
    ownerAgentId: agentId,
    name: schedule.name,
    enabled: schedule.enabled,
    timezone: schedule.timezone,
    trigger: schedule.trigger,
    concurrencyPolicy: schedule.concurrencyPolicy,
    retryPolicy: schedule.retryPolicy,
    action: {
      kind: "agent",
      target: {
        kind: "channel",
        channel: schedule.channel,
        senderKind: "system",
        senderActorId: "system:scheduler",
        contentType: "text",
        contentData: {
          text: schedule.instructions,
        },
      },
    },
  };
}

function isEnabled(schedule: ScheduleDefinition): boolean {
  return schedule.enabled !== false;
}

function concurrencyPolicyOf(
  schedule: ScheduleDefinition,
): ScheduleConcurrencyPolicy {
  return schedule.concurrencyPolicy ?? "forbid";
}

export function describeSchedule(schedule: ScheduleDefinition): string {
  const enabled = isEnabled(schedule) ? "enabled" : "disabled";
  const trigger =
    schedule.trigger.type === "every_ms"
      ? `every ${schedule.trigger.everyMs}ms`
      : `cron ${schedule.trigger.expression}`;
  const action = `agent/${schedule.action.target.kind}`;
  const concurrency = concurrencyPolicyOf(schedule);
  return `${schedule.id} (${enabled}, ${trigger}, ${action}, concurrency=${concurrency})`;
}
