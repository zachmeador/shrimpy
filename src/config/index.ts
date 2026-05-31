import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type ContextConfig,
  type ContextDefaultsConfig,
  resolveContextDefaultsConfig,
  validateContextConfig,
} from "../context/index.js";
import {
  resolveBriefingConfig,
  type BriefingConfig,
} from "./briefing.js";
import type { AgentConfig } from "./agents.js";
import { validateAgentsConfig } from "./agents.js";
import {
  resolveAdapterRoutingConfig,
  type AdapterRoutingConfig,
} from "./adapter-routing.js";
import {
  resolveGatewayStatusConfig,
  type GatewayStatusConfig,
} from "./gateway-status.js";
import { primaryConfigPath } from "./paths.js";
import { resolveRuntimeConfig, type RuntimeConfig } from "./runtime.js";
import { surfaceModules } from "../surfaces/index.js";
import {
  resolveToolRuntimeConfig,
  type ToolRuntimeConfig,
} from "./tools.js";
import { readJsonFileStrict } from "../util/json-file.js";

export interface ShrimpyConfig {
  workspace: string;
  tui?: {
    modelFavorites?: string[];
  };
  briefing?: BriefingConfig;
  context?: ContextConfig;
  contextDefaults?: ContextDefaultsConfig;
  agents?: AgentConfig[];
  tools?: ToolRuntimeConfig;
  runtime?: RuntimeConfig;
  status?: GatewayStatusConfig;
  adapters?: AdapterRoutingConfig;
  scheduler?: {
    tickIntervalMs?: number;
    defaultTimezone?: string;
  };
  outreach?: {
    preferredChannels?: string[];
  };
  [surfaceKey: string]: unknown;
}

function resolveWorkspace(): string {
  const pointerPath = join(homedir(), ".shrimpy-workspace.json");
  if (existsSync(pointerPath)) {
    const raw = readJsonFileStrict(
      pointerPath,
      (parsed) => parsed as Record<string, unknown>,
    );
    if (typeof raw.workspace === "string" && raw.workspace) return raw.workspace;
  }
  return join(process.cwd(), ".shrimpy");
}

function validateRawConfig(raw: Record<string, unknown>) {
  if (raw.model !== undefined) {
    throw new Error(
      "config.model is not supported. Move that provider/id object to agents[].model and remove the top-level model field.",
    );
  }
  if (raw.context) validateContextConfig(raw.context);
  if (raw.briefing !== undefined) resolveBriefingConfig(raw.briefing);
  if (raw.contextDefaults !== undefined) {
    resolveContextDefaultsConfig(raw.contextDefaults);
  }
  if (raw.agents !== undefined) validateAgentsConfig(raw.agents);
  if (raw.tools !== undefined) resolveToolRuntimeConfig(raw.tools);
  if (raw.runtime !== undefined) resolveRuntimeConfig(raw.runtime);
  if (raw.status !== undefined) resolveGatewayStatusConfig(raw.status);
  if (raw.adapters !== undefined) resolveAdapterRoutingConfig(raw.adapters);
  for (const surface of surfaceModules) {
    if (raw[surface.name] !== undefined) {
      surface.validateConfig(raw[surface.name]);
    }
  }
}

export function loadConfigForWorkspace(workspace: string): ShrimpyConfig {
  const configPath = primaryConfigPath(workspace);

  if (existsSync(configPath)) {
    const raw = readJsonFileStrict(
      configPath,
      (parsed) => parsed as Record<string, unknown>,
    );
    validateRawConfig(raw);
    return { ...raw, workspace };
  }

  return { workspace };
}

export function loadConfig(): ShrimpyConfig {
  return loadConfigForWorkspace(resolveWorkspace());
}

export * from "./adapter-routing.js";
export * from "./agents.js";
export * from "./briefing.js";
export * from "./gateway-status.js";
export * from "./model.js";
export * from "./paths.js";
export * from "./runtime.js";
export * from "./tools.js";
