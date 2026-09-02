import { SettingsManager } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_AGENT_ID,
  type AgentConfig,
} from "../config/agents.js";
import type { PiSettingsConfig } from "../config/pi.js";
import {
  resolveRuntimeConfig,
  type RuntimeConfig,
} from "../config/runtime.js";
import {
  isThinkingLevel,
  type ThinkingLevel,
} from "../config/thinking.js";
import { editConfigFile, readConfigFile } from "../config/store.js";
import { withFileTransactionLock } from "../util/file-lock.js";
import { isRecord } from "../util/record.js";
import { primaryConfigPath } from "../workspace/paths.js";

type SessionSettings = Pick<
  PiSettingsConfig,
  "theme" | "quietStartup" | "compaction"
>;

const SHRIMPY_OWNED_PI_SETTINGS = new Set<keyof PiSettingsConfig>([
  "theme",
  "quietStartup",
  "compaction",
  "defaultThinkingLevel",
]);

export function createSessionSettingsManager(opts: {
  workspace: string;
  agentId: string;
  runtimeConfig: Required<RuntimeConfig>;
  settings: SessionSettings;
}): SettingsManager {
  return SettingsManager.fromStorage(new ShrimpyPiSettingsStorage(opts));
}

class ShrimpyPiSettingsStorage {
  private readonly workspace: string;
  private readonly agentId: string;
  private readonly runtimeConfig: Required<RuntimeConfig>;
  private settings: SessionSettings;

  constructor(opts: {
    workspace: string;
    agentId: string;
    runtimeConfig: Required<RuntimeConfig>;
    settings: SessionSettings;
  }) {
    this.workspace = opts.workspace;
    this.agentId = opts.agentId;
    this.runtimeConfig = opts.runtimeConfig;
    this.settings = structuredClone(opts.settings);
  }

  withLock(
    scope: "global" | "project",
    mutate: (current: string | undefined) => string | undefined,
  ): void {
    if (scope === "project") {
      const next = mutate(undefined);
      if (next !== undefined) {
        throw new Error("Shrimpy does not support project-scoped Pi settings");
      }
      return;
    }

    withFileTransactionLock(primaryConfigPath(this.workspace), () => {
      const { raw } = readConfigFile(this.workspace);
      const current = composeSettings(raw, this.agentId, this.settings);
      const nextRaw = mutate(JSON.stringify(current, null, 2));
      if (nextRaw === undefined) return;

      const next = parseSettings(nextRaw);
      persistSettings(raw, current, next, this.agentId);
      editConfigFile(this.workspace, () => {}, { baseRaw: raw });
      this.updateRuntimeConfig(current, next);
      this.settings = {
        theme: next.theme,
        quietStartup: next.quietStartup,
        compaction: structuredClone(next.compaction),
      };
    });
  }

  private updateRuntimeConfig(
    current: PiSettingsConfig,
    next: PiSettingsConfig,
  ): void {
    if (current.theme !== next.theme && next.theme !== undefined) {
      this.runtimeConfig.theme = next.theme;
    }
    if (
      current.quietStartup !== next.quietStartup
      && next.quietStartup !== undefined
    ) {
      this.runtimeConfig.quietStartup = next.quietStartup;
    }
    if (next.compaction) {
      this.runtimeConfig.compaction = {
        ...this.runtimeConfig.compaction,
        ...next.compaction,
      };
    }
  }
}

function composeSettings(
  raw: Record<string, unknown>,
  agentId: string,
  defaults: SessionSettings,
): PiSettingsConfig {
  const runtime = resolveRuntimeConfig(raw.runtime);
  return {
    ...storedPiSettings(raw),
    theme: runtime.theme,
    quietStartup: runtime.quietStartup,
    compaction: structuredClone(defaults.compaction),
    defaultThinkingLevel: configuredAgentThinking(raw.agents, agentId),
  };
}

function storedPiSettings(raw: Record<string, unknown>): PiSettingsConfig {
  if (!isRecord(raw.pi) || !isRecord(raw.pi.settings)) return {};
  return structuredClone(raw.pi.settings) as PiSettingsConfig;
}

function parseSettings(raw: string): PiSettingsConfig {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error("Pi settings must be an object");
  return parsed as PiSettingsConfig;
}

function persistSettings(
  raw: Record<string, unknown>,
  current: PiSettingsConfig,
  next: PiSettingsConfig,
  agentId: string,
): void {
  persistRuntimeSettings(raw, current, next);
  if (current.defaultThinkingLevel !== next.defaultThinkingLevel) {
    persistAgentThinking(raw, agentId, next.defaultThinkingLevel);
  }

  const piSettings = Object.fromEntries(
    Object.entries(next).filter(([key]) => (
      !SHRIMPY_OWNED_PI_SETTINGS.has(key as keyof PiSettingsConfig)
    )),
  );
  if (Object.keys(piSettings).length === 0) {
    delete raw.pi;
  } else {
    raw.pi = { settings: piSettings };
  }
}

function persistRuntimeSettings(
  raw: Record<string, unknown>,
  current: PiSettingsConfig,
  next: PiSettingsConfig,
): void {
  const runtime = isRecord(raw.runtime) ? { ...raw.runtime } : {};
  let changed = false;
  if (current.theme !== next.theme) {
    runtime.theme = next.theme;
    changed = true;
  }
  if (current.quietStartup !== next.quietStartup) {
    runtime.quietStartup = next.quietStartup;
    changed = true;
  }
  if (!sameJson(current.compaction, next.compaction)) {
    runtime.compaction = {
      ...(isRecord(runtime.compaction) ? runtime.compaction : {}),
      ...(next.compaction ?? {}),
    };
    changed = true;
  }
  if (changed) raw.runtime = runtime;
}

function persistAgentThinking(
  raw: Record<string, unknown>,
  agentId: string,
  level: ThinkingLevel | undefined,
): void {
  const agents = configuredAgents(raw.agents, agentId);
  const agent = agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    throw new Error(`Cannot save thinking default for unknown agent ${agentId}`);
  }
  if (level === undefined) delete agent.thinking;
  else agent.thinking = level;
  raw.agents = agents;
}

function configuredAgentThinking(
  raw: unknown,
  agentId: string,
): ThinkingLevel | undefined {
  if (!Array.isArray(raw)) return undefined;
  const agent = (raw as unknown[]).find((candidate) => (
    isRecord(candidate) && candidate.id === agentId
  ));
  return isRecord(agent) && isThinkingLevel(agent.thinking)
    ? agent.thinking
    : undefined;
}

function configuredAgents(raw: unknown, agentId: string): AgentConfig[] {
  if (Array.isArray(raw)) {
    return raw.map((agent) => ({ ...(agent as AgentConfig) }));
  }
  if (raw === undefined && agentId === DEFAULT_AGENT_ID) {
    return [{ id: DEFAULT_AGENT_ID }];
  }
  throw new Error(`Cannot save thinking default for unknown agent ${agentId}`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
