import {
  type ContextConfig,
  type ContextDefaultsConfig,
} from "../context/spec.js";
import type { AgentConfig } from "./agents.js";
import {
  type GatewayStatusConfig,
} from "./gateway-status.js";
import { type RuntimeConfig } from "./runtime.js";
import {
  type ToolRuntimeConfig,
} from "./tools.js";
import {
  type ModelPoliciesConfig,
} from "./model.js";
import {
  readConfigFile,
  validateRawConfig,
} from "./store.js";
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
  watchClock?: {
    tickIntervalMs?: number;
    defaultTimezone?: string;
  };
  outreach?: {
    preferredChannels?: string[];
  };
  [surfaceKey: string]: unknown;
}

export function loadConfigForWorkspace(workspace: string): ShrimpyConfig {
  const { raw } = readConfigFile(workspace);

  if (Object.keys(raw).length > 0) {
    validateRawConfig(raw);
    return { ...raw, workspace };
  }

  return { workspace };
}

export function loadConfig(): ShrimpyConfig {
  return loadConfigForWorkspace(resolveWorkspacePath());
}

export * from "./agents.js";
export * from "./gateway-status.js";
export * from "./model.js";
export * from "./paths.js";
export * from "./runtime.js";
export * from "./store.js";
export * from "./tools.js";
export * from "./workspace.js";
