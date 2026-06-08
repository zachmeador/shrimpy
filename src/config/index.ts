import { existsSync } from "node:fs";
import {
  type ContextConfig,
  type ContextDefaultsConfig,
  resolveContextDefaultsConfig,
  validateContextConfig,
} from "../context/spec.js";
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
import {
  resolveToolRuntimeConfig,
  type ToolRuntimeConfig,
} from "./tools.js";
import { readJsonFileStrict } from "../util/json-file.js";
import {
  type ModelPoliciesConfig,
  validateModelPoliciesConfig,
} from "./model.js";
import { resolveWorkspacePath } from "./workspace.js";

export interface ShrimpyConfig {
  workspace: string;
  tui?: {
    modelFavorites?: string[];
  };
  context?: ContextConfig;
  contextDefaults?: ContextDefaultsConfig;
  agents?: AgentConfig[];
  modelPolicies?: ModelPoliciesConfig;
  tools?: ToolRuntimeConfig;
  runtime?: RuntimeConfig;
  status?: GatewayStatusConfig;
  adapters?: AdapterRoutingConfig;
  watchClock?: {
    tickIntervalMs?: number;
    defaultTimezone?: string;
  };
  outreach?: {
    preferredChannels?: string[];
  };
  [surfaceKey: string]: unknown;
}

function validateRawConfig(raw: Record<string, unknown>) {
  if (raw.model !== undefined) {
    throw new Error(
      "config.model is not supported. Move provider/id candidates to modelPolicies and set agents[].modelPolicy.",
    );
  }
  const removedTurnContextKey = "brief" + "ing";
  if (raw[removedTurnContextKey] !== undefined) {
    throw new Error(
      `config.${removedTurnContextKey} is not supported. Move per-turn settings to context.turn and remove that top-level field.`,
    );
  }
  if (raw.context) validateContextConfig(raw.context);
  if (raw.contextDefaults !== undefined) {
    resolveContextDefaultsConfig(raw.contextDefaults);
  }
  if (raw.agents !== undefined) validateAgentsConfig(raw.agents);
  if (raw.modelPolicies !== undefined) validateModelPoliciesConfig(raw.modelPolicies);
  if (raw.tools !== undefined) resolveToolRuntimeConfig(raw.tools);
  if (raw.runtime !== undefined) resolveRuntimeConfig(raw.runtime);
  if (raw.status !== undefined) resolveGatewayStatusConfig(raw.status);
  if (raw.adapters !== undefined) resolveAdapterRoutingConfig(raw.adapters);
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
  return loadConfigForWorkspace(resolveWorkspacePath());
}

export * from "./adapter-routing.js";
export * from "./agents.js";
export * from "./gateway-status.js";
export * from "./model.js";
export * from "./paths.js";
export * from "./runtime.js";
export * from "./tools.js";
export * from "./workspace.js";
