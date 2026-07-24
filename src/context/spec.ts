import { channelMatches } from "../util/channel-pattern.js";
import { KNOWN_RUNTIME_ENV_KEYS } from "./env.js";
import type { ContextSourceConfig } from "./source.js";
import {
  resolveContextTurnProducer,
  type ContextTurnProducerConfig,
  type ResolvedContextTurnProducer,
} from "./turn/producer.js";

interface ContextChannelOverride {
  sources?: ContextSourceConfig[];
  env?: string[];
}

interface ContextAgentOverride {
  sources?: ContextSourceConfig[];
  env?: string[];
  channels?: Record<string, ContextChannelOverride>;
}

export interface ContextTurnChannelUnreadConfig {
  enabled?: boolean;
  channels?: string[];
  includeLatest?: boolean;
}

export interface ContextTurnSessionStatusConfig {
  enabled?: boolean;
  staleAfterMinutes?: number;
}

export interface ContextTurnConfig {
  maxChars?: number;
  channelUnread?: ContextTurnChannelUnreadConfig;
  sessionStatus?: ContextTurnSessionStatusConfig;
  producers?: ContextTurnProducerConfig[];
}

export interface ResolvedContextTurnConfig {
  maxChars: number;
  channelUnread: {
    enabled: boolean;
    channels: string[];
    includeLatest: boolean;
  };
  sessionStatus: {
    enabled: boolean;
    staleAfterMinutes: number;
  };
  producers: ResolvedContextTurnProducer[];
}

export interface ResolvedContextConfig {
  sources: ContextSourceConfig[];
  env: string[];
  channels: Record<string, ContextChannelOverride>;
  agents: Record<string, ContextAgentOverride>;
  turn: ResolvedContextTurnConfig;
}

type ContextResourceScope = "workspace" | "agent";

interface ParsedContextResource {
  scope: ContextResourceScope;
  path: string;
}

export interface ContextConfig {
  sources?: ContextSourceConfig[];
  env?: string[];
  channels?: Record<string, ContextChannelOverride>;
  agents?: Record<string, ContextAgentOverride>;
  turn?: ContextTurnConfig;
}

export type ContextDefaultsConfig = Pick<ContextConfig, "sources" | "env">;

export const DEFAULT_CONTEXT_SOURCES: ContextSourceConfig[] = [
  "workspace:context/",
  "agent:SOUL.md",
  "agent:context/",
];

export const DEFAULT_CONTEXT_ENV = [
  "workspace_path",
  "shrimpy_version",
  "hostname",
  "timezone",
  "session_type",
  "channel",
  "session_dir",
];

/** A directory source. String sources ending in "/" load Markdown files recursively. */
export function isDirectoryResource(source: ContextSourceConfig): boolean {
  const { path } = parseContextResource(source);
  return path.endsWith("/");
}

function validateStringList(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${key} must be an array of strings`);
  }
  return value as string[];
}

function validateSourceList(
  value: unknown,
  key: string,
): ContextSourceConfig[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array of stable context resource strings`);
  }
  return value.map((item, index) => validateSource(item, `${key}[${index}]`));
}

function validatePositiveInteger(
  value: unknown,
  key: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value as number;
}

function validateBoolean(value: unknown, key: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function validateContextTurnConfig(value: unknown): ContextTurnConfig | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("context.turn must be an object");
  }

  const obj = value as Record<string, unknown>;
  const allowed = new Set(["maxChars", "channelUnread", "sessionStatus", "producers"]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`unknown key in context.turn: "${key}"`);
    }
  }

  const maxChars = validatePositiveInteger(obj.maxChars, "context.turn.maxChars");
  const channelUnread = validateContextTurnChannelUnreadConfig(obj.channelUnread);
  const sessionStatus = validateContextTurnSessionStatusConfig(obj.sessionStatus);
  const producers = validateContextTurnProducerList(
    obj.producers,
    "context.turn.producers",
  );

  return {
    ...(maxChars !== undefined ? { maxChars } : {}),
    ...(channelUnread !== undefined ? { channelUnread } : {}),
    ...(sessionStatus !== undefined ? { sessionStatus } : {}),
    ...(producers !== undefined ? { producers } : {}),
  };
}

function validateContextTurnChannelUnreadConfig(
  value: unknown,
): ContextTurnChannelUnreadConfig | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("context.turn.channelUnread must be an object");
  }

  const obj = value as Record<string, unknown>;
  const allowed = new Set(["enabled", "channels", "includeLatest"]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`unknown key in context.turn.channelUnread: "${key}"`);
    }
  }

  return {
    enabled: validateBoolean(obj.enabled, "context.turn.channelUnread.enabled"),
    channels: validateStringList(obj.channels, "context.turn.channelUnread.channels"),
    includeLatest: validateBoolean(
      obj.includeLatest,
      "context.turn.channelUnread.includeLatest",
    ),
  };
}

function validateContextTurnSessionStatusConfig(
  value: unknown,
): ContextTurnSessionStatusConfig | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("context.turn.sessionStatus must be an object");
  }

  const obj = value as Record<string, unknown>;
  const allowed = new Set(["enabled", "staleAfterMinutes"]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`unknown key in context.turn.sessionStatus: "${key}"`);
    }
  }

  return {
    enabled: validateBoolean(obj.enabled, "context.turn.sessionStatus.enabled"),
    staleAfterMinutes: validatePositiveInteger(
      obj.staleAfterMinutes,
      "context.turn.sessionStatus.staleAfterMinutes",
    ),
  };
}

function validateSource(item: unknown, key: string): ContextSourceConfig {
  if (typeof item === "string") {
    if (item.trim() === "") {
      throw new Error(`${key} must be a non-empty resource address`);
    }
    parseContextResource(item, key);
    return item;
  }
  throw new Error(
    `${key} must be a stable resource string; configure automatic commands in context.turn.producers with { id, run, ... }`,
  );
}

function validateContextTurnProducerList(
  value: unknown,
  key: string,
): ContextTurnProducerConfig[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${key} must be an array of producer objects`);
  }
  const producers = value.map((item, index) =>
    validateContextTurnProducer(item, `${key}[${index}]`)
  );
  const ids = new Set<string>();
  for (const producer of producers) {
    if (ids.has(producer.id)) {
      throw new Error(`${key} contains duplicate producer id "${producer.id}"`);
    }
    ids.add(producer.id);
  }
  return producers;
}

function validateContextTurnProducer(
  value: unknown,
  key: string,
): ContextTurnProducerConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${key} must be a producer object`);
  }
  const obj = value as Record<string, unknown>;
  const allowed = new Set(["id", "run", "when", "timeoutMs", "cacheMs", "maxChars"]);
  for (const objKey of Object.keys(obj)) {
    if (!allowed.has(objKey)) {
      throw new Error(`unknown key in ${key}: "${objKey}"`);
    }
  }
  if (typeof obj.id !== "string" || obj.id.trim() === "") {
    throw new Error(`${key}.id must be a non-empty string`);
  }
  if (obj.id === "runtime:turn-context") {
    throw new Error(`${key}.id "runtime:turn-context" is reserved`);
  }
  if (typeof obj.run !== "string" || obj.run.trim() === "") {
    throw new Error(`${key}.run must be a non-empty string`);
  }

  let when: ContextTurnProducerConfig["when"];
  if (obj.when !== undefined) {
    if (typeof obj.when !== "object" || obj.when === null || Array.isArray(obj.when)) {
      throw new Error(`${key}.when must be an object`);
    }
    const whenObj = obj.when as Record<string, unknown>;
    for (const whenKey of Object.keys(whenObj)) {
      if (whenKey !== "channels") {
        throw new Error(`unknown key in ${key}.when: "${whenKey}"`);
      }
    }
    const channels = validateStringList(whenObj.channels, `${key}.when.channels`);
    when = channels === undefined ? {} : { channels };
  }

  const timeoutMs = validatePositiveInteger(obj.timeoutMs, `${key}.timeoutMs`);
  const maxChars = validatePositiveInteger(obj.maxChars, `${key}.maxChars`);
  const cacheMs = validateNonNegativeInteger(obj.cacheMs, `${key}.cacheMs`);
  return {
    id: obj.id,
    run: obj.run,
    ...(when !== undefined ? { when } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(cacheMs !== undefined ? { cacheMs } : {}),
    ...(maxChars !== undefined ? { maxChars } : {}),
  };
}

function validateNonNegativeInteger(
  value: unknown,
  key: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return value as number;
}

export function parseContextResource(
  resource: string,
  key = "context resource",
): ParsedContextResource {
  const [scope, ...pathParts] = resource.split(":");
  const path = pathParts.join(":");
  if (scope !== "workspace" && scope !== "agent") {
    throw new Error(`${key} must start with "workspace:" or "agent:"`);
  }
  if (path.trim() === "") {
    throw new Error(`${key} must include a resource path`);
  }
  return { scope, path };
}

function validateEnvKeyList(value: unknown, key: string): string[] | undefined {
  const list = validateStringList(value, key);
  if (!list) return undefined;
  for (const envKey of list) {
    if (!KNOWN_RUNTIME_ENV_KEYS.has(envKey)) {
      throw new Error(
        `unknown env key in ${key}: "${envKey}". Known keys: ${[
          ...KNOWN_RUNTIME_ENV_KEYS,
        ].join(", ")}`,
      );
    }
  }
  return list;
}

export function resolveContextDefaultsConfig(
  raw?: unknown,
): Required<ContextDefaultsConfig> {
  if (raw === undefined) {
    return {
      sources: [...DEFAULT_CONTEXT_SOURCES],
      env: [...DEFAULT_CONTEXT_ENV],
    };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("contextDefaults config must be an object");
  }

  const obj = raw as Record<string, unknown>;
  const allowed = new Set(["sources", "env"]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`unknown key in contextDefaults config: "${key}"`);
    }
  }

  const sources = validateSourceList(obj.sources, "contextDefaults.sources");
  const env = validateEnvKeyList(obj.env, "contextDefaults.env");

  return {
    sources: sources ?? [...DEFAULT_CONTEXT_SOURCES],
    env: env ?? [...DEFAULT_CONTEXT_ENV],
  };
}

export function validateContextConfig(ctx: unknown): ContextConfig {
  if (typeof ctx !== "object" || ctx === null || Array.isArray(ctx)) {
    throw new Error("context config must be an object");
  }

  const obj = ctx as Record<string, unknown>;
  const allowed = new Set([
    "sources",
    "env",
    "channels",
    "agents",
    "turn",
  ]);

  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`unknown key in context config: "${key}"`);
    }
  }

  validateSourceList(obj.sources, "context.sources");
  validateEnvKeyList(obj.env, "context.env");
  const turn = validateContextTurnConfig(obj.turn);

  if (obj.channels !== undefined) {
    validateChannelOverrides(obj.channels, "context.channels");
  }

  if (obj.agents !== undefined) {
    if (
      typeof obj.agents !== "object" ||
      obj.agents === null ||
      Array.isArray(obj.agents)
    ) {
      throw new Error("context.agents must be an object");
    }
    for (const [agentId, override] of Object.entries(
      obj.agents as Record<string, unknown>,
    )) {
      if (
        typeof override !== "object" ||
        override === null ||
        Array.isArray(override)
      ) {
        throw new Error(`context.agents["${agentId}"] must be an object`);
      }
      const ov = override as Record<string, unknown>;
      const allowedOv = new Set(["sources", "env", "channels"]);
      for (const key of Object.keys(ov)) {
        if (!allowedOv.has(key)) {
          throw new Error(
            `unknown key in context.agents["${agentId}"]: "${key}"`,
          );
        }
      }
      validateSourceList(ov.sources, `context.agents["${agentId}"].sources`);
      validateEnvKeyList(ov.env, `context.agents["${agentId}"].env`);
      if (ov.channels !== undefined) {
        validateChannelOverrides(
          ov.channels,
          `context.agents["${agentId}"].channels`,
        );
      }
    }
  }

  return {
    ...(obj.sources !== undefined ? { sources: validateSourceList(obj.sources, "context.sources") } : {}),
    ...(obj.env !== undefined ? { env: validateEnvKeyList(obj.env, "context.env") } : {}),
    ...(obj.channels !== undefined ? { channels: obj.channels as Record<string, ContextChannelOverride> } : {}),
    ...(obj.agents !== undefined ? { agents: obj.agents as Record<string, ContextAgentOverride> } : {}),
    ...(turn !== undefined ? { turn } : {}),
  };
}

function validateChannelOverrides(value: unknown, key: string): void {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`${key} must be an object`);
  }
  for (const [pattern, override] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (
      typeof override !== "object" ||
      override === null ||
      Array.isArray(override)
    ) {
      throw new Error(`${key}["${pattern}"] must be an object`);
    }
    const ov = override as Record<string, unknown>;
    const allowedOv = new Set(["sources", "env"]);
    for (const ovKey of Object.keys(ov)) {
      if (!allowedOv.has(ovKey)) {
        throw new Error(
          `unknown key in ${key}["${pattern}"]: "${ovKey}"`,
        );
      }
    }
    validateSourceList(ov.sources, `${key}["${pattern}"].sources`);
    validateEnvKeyList(ov.env, `${key}["${pattern}"].env`);
  }
}

export function resolveContextConfig(
  raw?: unknown,
  defaultsRaw?: unknown,
): ResolvedContextConfig {
  const defaults = resolveContextDefaultsConfig(defaultsRaw);
  if (!raw) {
    return {
      sources: [...defaults.sources],
      env: [...defaults.env],
      channels: {},
      agents: {},
      turn: resolveContextTurnConfig(),
    };
  }

  const validated = validateContextConfig(raw);
  return {
    sources: validated.sources ?? defaults.sources,
    env: validated.env ?? defaults.env,
    channels: validated.channels ?? {},
    agents: validated.agents ?? {},
    turn: resolveContextTurnConfig(validated.turn),
  };
}

export function resolveContextTurnConfig(
  raw?: ContextTurnConfig,
): ResolvedContextTurnConfig {
  return {
    maxChars: raw?.maxChars ?? 2000,
    channelUnread: {
      enabled: raw?.channelUnread?.enabled ?? true,
      channels: raw?.channelUnread?.channels ?? ["*"],
      includeLatest: raw?.channelUnread?.includeLatest ?? true,
    },
    sessionStatus: {
      enabled: raw?.sessionStatus?.enabled ?? true,
      staleAfterMinutes: raw?.sessionStatus?.staleAfterMinutes ?? 12 * 60,
    },
    producers: (raw?.producers ?? []).map(resolveContextTurnProducer),
  };
}

export function findChannelOverrides(
  channels: Record<string, ContextChannelOverride>,
  channel: string,
): ContextChannelOverride[] {
  const matches: ContextChannelOverride[] = [];
  for (const [pattern, override] of Object.entries(channels)) {
    if (channelMatches(pattern, channel)) {
      matches.push(override);
    }
  }
  return matches;
}

export function findContextViewOverrides(
  ctx: ResolvedContextConfig,
  opts?: {
    agentId?: string;
    channel?: string;
  },
): ContextChannelOverride[] {
  const overrides: ContextChannelOverride[] = [];
  if (opts?.channel) {
    overrides.push(...findChannelOverrides(ctx.channels, opts.channel));
  }

  const agentOverride = opts?.agentId ? ctx.agents[opts.agentId] : undefined;
  if (!agentOverride) return overrides;

  if (agentOverride.sources || agentOverride.env) {
    overrides.push({
      sources: agentOverride.sources,
      env: agentOverride.env,
    });
  }
  if (opts?.channel && agentOverride.channels) {
    overrides.push(...findChannelOverrides(agentOverride.channels, opts.channel));
  }

  return overrides;
}
