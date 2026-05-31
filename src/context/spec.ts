import { channelMatches } from "../util/channel-pattern.js";
import { KNOWN_RUNTIME_ENV_KEYS } from "./env.js";
import {
  COMMAND_SOURCE_DEFAULTS,
  type ContextCommandSourceConfig,
  type ContextSourceConfig,
} from "./source.js";

export interface ContextChannelOverride {
  sources?: ContextSourceConfig[];
  env?: string[];
}

export interface ContextAgentOverride {
  sources?: ContextSourceConfig[];
  env?: string[];
  channels?: Record<string, ContextChannelOverride>;
}

export type ContextResourceScope = "workspace" | "agent";

export interface ParsedContextResource {
  scope: ContextResourceScope;
  path: string;
}

export interface ContextConfig {
  sources?: ContextSourceConfig[];
  env?: string[];
  channels?: Record<string, ContextChannelOverride>;
  agents?: Record<string, ContextAgentOverride>;
}

export interface ContextDefaultsConfig {
  sources?: ContextSourceConfig[];
  env?: string[];
}

export const DEFAULT_CONTEXT_SOURCES: ContextSourceConfig[] = [
  "workspace:profile/WORKSPACE.md",
  "workspace:profile/SYSTEM.md",
  "agent:SOUL.md",
  "workspace:profile/USER.md",
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

/**
 * A directory source. String sources ending in "/" load every top-level .md
 * file under the directory in deterministic path order, each as its own
 * session section. Subdirectories (e.g. context/people/, context/channels/)
 * are intentionally skipped — they are turn-scoped slices.
 */
export function isDirectoryResource(source: ContextSourceConfig): boolean {
  if (typeof source !== "string") return false;
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
    throw new Error(`${key} must be an array of context sources`);
  }
  return value.map((item, index) => validateSource(item, `${key}[${index}]`));
}

function validateSource(item: unknown, key: string): ContextSourceConfig {
  if (typeof item === "string") {
    if (item.trim() === "") {
      throw new Error(`${key} must be a non-empty resource address`);
    }
    parseContextResource(item, key);
    return item;
  }
  if (typeof item === "object" && item !== null && !Array.isArray(item)) {
    const obj = item as Record<string, unknown>;
    if (obj.type !== "command") {
      throw new Error(`${key} object source must have type: "command"`);
    }
    if (typeof obj.id !== "string" || obj.id.trim() === "") {
      throw new Error(`${key}.id must be a non-empty string`);
    }
    if (typeof obj.command !== "string" || obj.command.trim() === "") {
      throw new Error(`${key}.command must be a non-empty string`);
    }
    const cmd: ContextCommandSourceConfig = {
      type: "command",
      id: obj.id,
      command: obj.command,
    };
    if (obj.channels !== undefined) {
      const list = validateStringList(obj.channels, `${key}.channels`);
      cmd.channels = list ?? [...COMMAND_SOURCE_DEFAULTS.channels];
    }
    for (const numKey of ["timeoutMs", "maxChars", "freshForMs"] as const) {
      if (obj[numKey] !== undefined) {
        if (typeof obj[numKey] !== "number" || !Number.isFinite(obj[numKey])) {
          throw new Error(`${key}.${numKey} must be a number`);
        }
        cmd[numKey] = obj[numKey] as number;
      }
    }
    return cmd;
  }
  throw new Error(`${key} must be a resource string or a command source object`);
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
  ]);

  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new Error(`unknown key in context config: "${key}"`);
    }
  }

  validateSourceList(obj.sources, "context.sources");
  validateEnvKeyList(obj.env, "context.env");

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

  return obj as ContextConfig;
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
): Required<ContextConfig> {
  const defaults = resolveContextDefaultsConfig(defaultsRaw);
  if (!raw) {
    return {
      sources: [...defaults.sources],
      env: [...defaults.env],
      channels: {},
      agents: {},
    };
  }

  const validated = validateContextConfig(raw);
  return {
    sources: validated.sources ?? defaults.sources,
    env: validated.env ?? defaults.env,
    channels: validated.channels ?? {},
    agents: validated.agents ?? {},
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
  ctx: Required<ContextConfig>,
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
