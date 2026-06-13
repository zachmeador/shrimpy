import { Type, type Static } from "@sinclair/typebox";
import { parseConfig } from "../../config/parse.js";
import type { ResolvedSurfaceInstance } from "../shared/module.js";
import {
  resolveTelegramPolicy,
  type TelegramPolicyOverrides,
} from "./client.js";

const policySchema = Type.Object(
  {
    sendMaxRetries: Type.Optional(Type.Number()),
    pollTimeoutSec: Type.Optional(Type.Number()),
    backoff: Type.Optional(
      Type.Object(
        {
          initialMs: Type.Optional(Type.Number()),
          maxMs: Type.Optional(Type.Number()),
          factor: Type.Optional(Type.Number()),
          jitter: Type.Optional(Type.Number()),
        },
        { additionalProperties: false },
      ),
    ),
    stallDetection: Type.Optional(
      Type.Object(
        {
          thresholdMs: Type.Optional(Type.Number()),
          watchdogIntervalMs: Type.Optional(Type.Number()),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const TELEGRAM_INSTANCE_ID_PATTERN = "^[a-zA-Z0-9._-]+$";

const instanceSchema = Type.Object(
  {
    token: Type.String({ minLength: 1 }),
    defaultAgentId: Type.String({
      pattern: TELEGRAM_INSTANCE_ID_PATTERN,
      minLength: 1,
    }),
    allowedChatIds: Type.Optional(Type.Array(Type.Integer(), { minItems: 1 })),
    users: Type.Optional(Type.Record(
      Type.String({ minLength: 1 }),
      Type.Object(
        {
          id: Type.String({ pattern: "^[a-zA-Z0-9._:-]+$", minLength: 1 }),
          displayName: Type.Optional(Type.String({ minLength: 1 })),
        },
        { additionalProperties: false },
      ),
    )),
    textBurstWindowMs: Type.Optional(Type.Integer()),
    mediaGroupWindowMs: Type.Optional(Type.Integer()),
    policy: Type.Optional(policySchema),
  },
  { additionalProperties: false },
);

const schema = Type.Object(
  {
    instances: Type.Optional(
      Type.Record(
        Type.String({
          pattern: TELEGRAM_INSTANCE_ID_PATTERN,
          minLength: 1,
        }),
        instanceSchema,
      ),
    ),
  },
  { additionalProperties: false },
);

export type TelegramRuntimeConfig = Static<typeof schema>;
export type TelegramRuntimeConfigInstance = Static<typeof instanceSchema>;

export interface ResolvedTelegramInstanceConfig extends ResolvedSurfaceInstance {
  id: string;
  token: string;
  allowedChatIds: number[];
  users: Record<string, {
    userId: string;
    actorId: string;
    displayName?: string;
  }>;
  textBurstWindowMs?: number;
  mediaGroupWindowMs?: number;
  policy?: TelegramPolicyOverrides;
}

export interface ResolvedTelegramRuntimeConfig {
  instances: ResolvedTelegramInstanceConfig[];
}

export function buildTelegramSurfaceId(instanceId: string): string {
  return `telegram.${instanceId}`;
}

export function buildTelegramChannelPrefix(instanceId: string): string {
  return `telegram~${instanceId}~`;
}

function validateTelegramWindowMs(
  value: number | undefined,
  key: string,
): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be an integer >= 0`);
  }
}

function requireTelegramAllowedChatIds(
  value: number[] | undefined,
  key: string,
): number[] {
  if (!value || value.length === 0) {
    throw new Error(`${key}.allowedChatIds must contain at least one Telegram chat id`);
  }
  return value;
}

export function validateTelegramRuntimeConfig(raw: unknown): void {
  const parsed = parseConfig(schema, raw, "telegram");
  for (const [id, instance] of Object.entries(parsed.instances ?? {})) {
    requireTelegramAllowedChatIds(instance.allowedChatIds, `telegram.instances.${id}`);
    if (instance.policy !== undefined) {
      resolveTelegramPolicy(instance.policy as TelegramPolicyOverrides);
    }
    validateTelegramWindowMs(
      instance.textBurstWindowMs,
      `telegram.instances.${id}.textBurstWindowMs`,
    );
    validateTelegramWindowMs(
      instance.mediaGroupWindowMs,
      `telegram.instances.${id}.mediaGroupWindowMs`,
    );
  }
}

export function resolveTelegramRuntimeConfig(
  raw: unknown,
  knownAgentIds?: string[],
): ResolvedTelegramRuntimeConfig {
  const parsed = parseConfig(schema, raw, "telegram");
  const instances = Object.entries(parsed.instances ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, instance]) => {
      if (knownAgentIds && !knownAgentIds.includes(instance.defaultAgentId)) {
        throw new Error(
          `telegram.instances.${id}.defaultAgentId references unknown agent "${instance.defaultAgentId}"`,
        );
      }
      if (instance.policy !== undefined) {
        resolveTelegramPolicy(instance.policy as TelegramPolicyOverrides);
      }
      validateTelegramWindowMs(
        instance.textBurstWindowMs,
        `telegram.instances.${id}.textBurstWindowMs`,
      );
      validateTelegramWindowMs(
        instance.mediaGroupWindowMs,
        `telegram.instances.${id}.mediaGroupWindowMs`,
      );
      const allowedChatIds = requireTelegramAllowedChatIds(
        instance.allowedChatIds,
        `telegram.instances.${id}`,
      );
      const surfaceId = buildTelegramSurfaceId(id);
      return {
        id,
        surfaceId,
        adapter: surfaceId,
        channelPrefix: buildTelegramChannelPrefix(id),
        token: instance.token,
        defaultAgentId: instance.defaultAgentId,
        allowedChatIds: [...allowedChatIds],
        users: resolveTelegramUsers(instance.users),
        textBurstWindowMs: instance.textBurstWindowMs,
        mediaGroupWindowMs: instance.mediaGroupWindowMs,
        policy: instance.policy as TelegramPolicyOverrides | undefined,
      };
    });

  return { instances };
}

function resolveTelegramUsers(
  users: TelegramRuntimeConfigInstance["users"] | undefined,
): ResolvedTelegramInstanceConfig["users"] {
  const resolved: ResolvedTelegramInstanceConfig["users"] = {};
  for (const [transportUserId, user] of Object.entries(users ?? {})) {
    resolved[transportUserId] = {
      userId: user.id,
      actorId: `human:${user.id}`,
      displayName: user.displayName,
    };
  }
  return resolved;
}

export function resolveTelegramDefaultAgentIds(
  config: ResolvedTelegramRuntimeConfig,
  channel: string,
): string[] {
  const matched = config.instances
    .filter((instance) => channel.startsWith(instance.channelPrefix))
    .map((instance) => instance.defaultAgentId);

  return [...new Set(matched)];
}

export function telegramChannelDisplayExample(instanceId = "shrimpy"): string {
  return `telegram~${instanceId}~123456789`;
}

export function validateTelegramInstanceId(instanceId: string): void {
  if (!new RegExp(TELEGRAM_INSTANCE_ID_PATTERN).test(instanceId)) {
    throw new Error(
      `telegram instance id "${instanceId}" must match ${TELEGRAM_INSTANCE_ID_PATTERN}`,
    );
  }
}
