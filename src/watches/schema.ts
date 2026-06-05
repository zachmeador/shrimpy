import { existsSync } from "node:fs";
import type { MessageSenderKind } from "../channels/index.js";
import { readJsonFileStrict } from "../util/json-file.js";

export type WatchConcurrencyPolicy = "forbid" | "allow";

export type WatchEmitPolicy =
  | "never"
  | "always"
  | "on_output"
  | "on_change"
  | "on_failure";

export interface WatchCommandAction {
  kind: "command";
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface WatchMessageAction {
  kind: "message";
  channel: string;
  text: string;
  addressedAgentId?: string;
  senderKind?: MessageSenderKind;
  senderActorId?: string;
  senderUserId?: string;
  senderDisplayName?: string;
}

export type WatchAction = WatchCommandAction | WatchMessageAction;

export interface WatchEveryMsTrigger {
  kind: "time";
  everyMs: number;
  cron?: never;
  timezone?: string;
}

export interface WatchCronTrigger {
  kind: "time";
  cron: string;
  everyMs?: never;
  timezone?: string;
}

export type WatchTrigger = WatchEveryMsTrigger | WatchCronTrigger;

export interface WatchEmitConfig {
  policy: WatchEmitPolicy;
  channel?: string;
  template?: string;
  addressedAgentId?: string;
  senderKind?: MessageSenderKind;
  senderActorId?: string;
  senderUserId?: string;
  senderDisplayName?: string;
}

export interface WatchDefinition {
  id: string;
  name?: string;
  enabled?: boolean;
  timezone?: string;
  trigger: WatchTrigger;
  action: WatchAction;
  emit?: WatchEmitConfig;
  concurrencyPolicy?: WatchConcurrencyPolicy;
}

export interface ResolvedAgentWatchDefinition extends WatchDefinition {
  ownerAgentId: string;
  localId: string;
}

export interface WatchRunDue {
  watch: ResolvedAgentWatchDefinition;
  watchId: string;
  runId: string;
  fireTimeMs: number;
  fireTimeIso: string;
  dedupeKey: string;
}

const CONCURRENCY_POLICIES = new Set<WatchConcurrencyPolicy>([
  "forbid",
  "allow",
]);

const EMIT_POLICIES = new Set<WatchEmitPolicy>([
  "never",
  "always",
  "on_output",
  "on_change",
  "on_failure",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const STRUCTURAL_INVISIBLE_PATTERN = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/;
const UNSAFE_FREEFORM_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
const FREEFORM_INVISIBLE_PATTERN = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/;

function assertString(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertStructuralString(
  value: unknown,
  label: string,
): string {
  const text = assertString(value, label);
  if (STRUCTURAL_INVISIBLE_PATTERN.test(text)) {
    throw new Error(`${label} must not contain control or invisible characters`);
  }
  return text;
}

function assertOptionalStructuralString(
  value: unknown,
  label: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  if (value.length === 0) return undefined;
  return assertStructuralString(value, label);
}

function assertFreeformText(
  value: unknown,
  label: string,
): string {
  const text = assertString(value, label);
  if (UNSAFE_FREEFORM_CONTROL_PATTERN.test(text)) {
    throw new Error(`${label} must not contain unsafe control characters`);
  }
  return text;
}

function freeformTextDiagnostics(
  value: string | undefined,
  label: string,
): string[] {
  if (!value) return [];
  const diagnostics: string[] = [];
  if (FREEFORM_INVISIBLE_PATTERN.test(value)) {
    diagnostics.push(`${label} contains invisible formatting characters`);
  }
  if (value.includes("\\'")) {
    diagnostics.push(`${label} contains a literal escaped apostrophe (\\')`);
  }
  return diagnostics;
}

function parseTrigger(raw: unknown, index: number): WatchTrigger {
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    throw new Error(`watches[${index}].trigger must be an object`);
  }

  if (raw.kind === "time") {
    const timezone = assertOptionalStructuralString(
      raw.timezone,
      `watches[${index}].trigger.timezone`,
    );

    if (raw.cron !== undefined) {
      if (raw.everyMs !== undefined) {
        throw new Error(
          `watches[${index}].trigger must include exactly one of cron or everyMs`,
        );
      }
      const expression = assertString(
        raw.cron,
        `watches[${index}].trigger.cron`,
      );
      return {
        kind: "time",
        cron: expression,
        ...(timezone ? { timezone } : {}),
      };
    }

    if (raw.everyMs !== undefined) {
      if (typeof raw.everyMs !== "number" || !(raw.everyMs > 0)) {
        throw new Error(`watches[${index}].trigger.everyMs must be > 0`);
      }
      return {
        kind: "time",
        everyMs: raw.everyMs,
        ...(timezone ? { timezone } : {}),
      };
    }

    throw new Error(
      `watches[${index}].trigger must include cron or everyMs when kind is "time"`,
    );
  }

  throw new Error(
    `watches[${index}].trigger.kind must be "time"`,
  );
}

function parseSenderKind(
  value: unknown,
  label: string,
): MessageSenderKind | undefined {
  if (value === undefined) return undefined;
  if (value === "human" || value === "agent" || value === "system") {
    return value;
  }
  throw new Error(`${label} must be "human" | "agent" | "system"`);
}

function parseAction(raw: unknown, index: number): WatchAction {
  if (!isRecord(raw) || typeof raw.kind !== "string") {
    throw new Error(`watches[${index}].action must be an object`);
  }

  if (raw.kind === "command") {
    const command = assertString(raw.command, `watches[${index}].action.command`);
    const cwd = assertOptionalStructuralString(
      raw.cwd,
      `watches[${index}].action.cwd`,
    );
    if (
      raw.timeoutMs !== undefined &&
      (typeof raw.timeoutMs !== "number" || !(raw.timeoutMs > 0))
    ) {
      throw new Error(`watches[${index}].action.timeoutMs must be > 0`);
    }
    return {
      kind: "command",
      command,
      ...(cwd ? { cwd } : {}),
      ...(typeof raw.timeoutMs === "number" ? { timeoutMs: raw.timeoutMs } : {}),
    };
  }

  if (raw.kind === "message") {
    const channel = assertStructuralString(raw.channel, `watches[${index}].action.channel`);
    const text = assertFreeformText(raw.text, `watches[${index}].action.text`);
    const senderKind = parseSenderKind(
      raw.senderKind,
      `watches[${index}].action.senderKind`,
    );
    const addressedAgentId = assertOptionalStructuralString(
      raw.addressedAgentId,
      `watches[${index}].action.addressedAgentId`,
    );
    const senderActorId = assertOptionalStructuralString(
      raw.senderActorId,
      `watches[${index}].action.senderActorId`,
    );
    const senderUserId = assertOptionalStructuralString(
      raw.senderUserId,
      `watches[${index}].action.senderUserId`,
    );
    const senderDisplayName = assertOptionalStructuralString(
      raw.senderDisplayName,
      `watches[${index}].action.senderDisplayName`,
    );
    return {
      kind: "message",
      channel,
      text,
      ...(addressedAgentId ? { addressedAgentId } : {}),
      ...(senderKind ? { senderKind } : {}),
      ...(senderActorId ? { senderActorId } : {}),
      ...(senderUserId ? { senderUserId } : {}),
      ...(senderDisplayName ? { senderDisplayName } : {}),
    };
  }

  throw new Error(`watches[${index}].action.kind must be "command" or "message"`);
}

function parseEmit(raw: unknown, index: number): WatchEmitConfig | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) {
    throw new Error(`watches[${index}].emit must be an object`);
  }
  if (!EMIT_POLICIES.has(raw.policy as WatchEmitPolicy)) {
    throw new Error(
      `watches[${index}].emit.policy must be never, always, on_output, on_change, or on_failure`,
    );
  }
  const channel = assertOptionalStructuralString(raw.channel, `watches[${index}].emit.channel`);
  const template = raw.template === undefined
    ? undefined
    : assertFreeformText(raw.template, `watches[${index}].emit.template`);
  const addressedAgentId = assertOptionalStructuralString(
    raw.addressedAgentId,
    `watches[${index}].emit.addressedAgentId`,
  );
  const senderKind = parseSenderKind(
    raw.senderKind,
    `watches[${index}].emit.senderKind`,
  );
  const senderActorId = assertOptionalStructuralString(
    raw.senderActorId,
    `watches[${index}].emit.senderActorId`,
  );
  const senderUserId = assertOptionalStructuralString(
    raw.senderUserId,
    `watches[${index}].emit.senderUserId`,
  );
  const senderDisplayName = assertOptionalStructuralString(
    raw.senderDisplayName,
    `watches[${index}].emit.senderDisplayName`,
  );
  return {
    policy: raw.policy as WatchEmitPolicy,
    ...(channel ? { channel } : {}),
    ...(template ? { template } : {}),
    ...(addressedAgentId ? { addressedAgentId } : {}),
    ...(senderKind ? { senderKind } : {}),
    ...(senderActorId ? { senderActorId } : {}),
    ...(senderUserId ? { senderUserId } : {}),
    ...(senderDisplayName ? { senderDisplayName } : {}),
  };
}

function parseWatchDefinition(
  raw: unknown,
  index: number,
): WatchDefinition {
  if (!isRecord(raw)) {
    throw new Error(`watches[${index}] must be an object`);
  }

  const id = assertStructuralString(raw.id, `watches[${index}].id`);
  if (id.includes("/")) {
    throw new Error(`watches[${index}].id must not contain "/"`);
  }
  const name = assertOptionalStructuralString(raw.name, `watches[${index}].name`);
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
    throw new Error(`watches[${index}].enabled must be a boolean`);
  }
  const timezone = assertOptionalStructuralString(raw.timezone, `watches[${index}].timezone`);
  if (
    raw.concurrencyPolicy !== undefined &&
    !CONCURRENCY_POLICIES.has(raw.concurrencyPolicy as WatchConcurrencyPolicy)
  ) {
    throw new Error(
      `watches[${index}].concurrencyPolicy must be "forbid" or "allow"`,
    );
  }
  if (raw.retryPolicy !== undefined) {
    throw new Error("watch retryPolicy is not supported until attempts are persisted");
  }

  const action = parseAction(raw.action, index);
  const emit = parseEmit(raw.emit, index);
  if (action.kind === "message" && emit) {
    throw new Error(
      `watches[${index}].emit is only supported for command watches`,
    );
  }
  if (action.kind === "command" && emit && emit.policy !== "never" && !emit.channel) {
    throw new Error(
      `watches[${index}].emit.channel is required when a command watch emits`,
    );
  }

  return {
    id,
    ...(name ? { name } : {}),
    ...(typeof raw.enabled === "boolean" ? { enabled: raw.enabled } : {}),
    ...(timezone ? { timezone } : {}),
    trigger: parseTrigger(raw.trigger, index),
    action,
    ...(emit ? { emit } : {}),
    ...(raw.concurrencyPolicy
      ? { concurrencyPolicy: raw.concurrencyPolicy as WatchConcurrencyPolicy }
      : {}),
  };
}

export function parseWatchDefinitions(raw: unknown): WatchDefinition[] {
  if (!Array.isArray(raw)) {
    throw new Error("watches file must contain a JSON array");
  }
  const watches = raw.map(parseWatchDefinition);
  const ids = new Set<string>();
  for (const watch of watches) {
    if (ids.has(watch.id)) {
      throw new Error(`duplicate watch id: ${watch.id}`);
    }
    ids.add(watch.id);
  }
  return watches;
}

export function watchDefinitionDiagnostics(
  watch: WatchDefinition | ResolvedAgentWatchDefinition,
): string[] {
  return [
    ...freeformTextDiagnostics(
      watch.action.kind === "message" ? watch.action.text : undefined,
      `watch ${watch.id} message text`,
    ),
    ...freeformTextDiagnostics(
      watch.emit?.template,
      `watch ${watch.id} emit template`,
    ),
  ];
}

export function loadAgentWatchDefinitions(path: string): WatchDefinition[] {
  if (!existsSync(path)) return [];
  return readJsonFileStrict(path, parseWatchDefinitions);
}

export function resolveAgentWatchDefinition(
  agentId: string,
  watch: WatchDefinition,
): ResolvedAgentWatchDefinition {
  return {
    ...watch,
    id: `${agentId}/${watch.id}`,
    ownerAgentId: agentId,
    localId: watch.id,
    action: watch.action.kind === "message" && !watch.action.addressedAgentId
      ? { ...watch.action, addressedAgentId: agentId }
      : watch.action,
  };
}

export function watchTriggerText(trigger: WatchTrigger): string {
  return "everyMs" in trigger
    ? `time every ${trigger.everyMs}ms`
    : `time cron ${trigger.cron}`;
}

export function watchTriggerMetadata(
  trigger: WatchTrigger,
  timezone?: string,
): Record<string, unknown> {
  if ("everyMs" in trigger) {
    return {
      kind: "time",
      everyMs: trigger.everyMs,
      ...(trigger.timezone ?? timezone
        ? { timezone: trigger.timezone ?? timezone }
        : {}),
    };
  }

  return {
    kind: "time",
    cron: trigger.cron,
    ...(trigger.timezone ?? timezone
      ? { timezone: trigger.timezone ?? timezone }
      : {}),
  };
}
