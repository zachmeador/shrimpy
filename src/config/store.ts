import { existsSync } from "node:fs";
import {
  type ContextDefaultsConfig,
  resolveContextDefaultsConfig,
  validateContextConfig,
} from "../context/spec.js";
import { readJsonFileStrict, writeJsonFileAtomic } from "../util/json-file.js";
import { validateAgentsConfig } from "./agents.js";
import { resolveGatewayStatusConfig } from "./gateway-status.js";
import { validateModelPoliciesConfig } from "./model.js";
import { primaryConfigPath } from "../workspace/paths.js";
import { resolveRuntimeConfig } from "./runtime.js";
import { resolveToolRuntimeConfig } from "./tools.js";
import { surfaceModules } from "../surfaces/registry.js";

interface ConfigFileEditOptions {
  missing?: "empty" | "error";
  baseRaw?: Record<string, unknown>;
}

export interface RawConfigFile {
  configPath: string;
  raw: Record<string, unknown>;
}

export function validateRawConfig(raw: Record<string, unknown>): void {
  if (raw.context) validateContextConfig(raw.context);
  if (raw.contextDefaults !== undefined) {
    resolveContextDefaultsConfig(raw.contextDefaults as ContextDefaultsConfig);
  }
  if (raw.agents !== undefined) validateAgentsConfig(raw.agents);
  if (raw.modelPolicies !== undefined) validateModelPoliciesConfig(raw.modelPolicies);
  if (raw.tools !== undefined) resolveToolRuntimeConfig(raw.tools);
  if (raw.runtime !== undefined) resolveRuntimeConfig(raw.runtime);
  if (raw.status !== undefined) resolveGatewayStatusConfig(raw.status);
  for (const module of surfaceModules) {
    const rawSurfaceConfig = raw[module.name];
    if (rawSurfaceConfig !== undefined) module.validateConfig(rawSurfaceConfig);
  }
}

export function readConfigFile(
  workspace: string,
  opts: ConfigFileEditOptions = {},
): RawConfigFile {
  const configPath = primaryConfigPath(workspace);
  if (!existsSync(configPath)) {
    if (opts.missing === "error") {
      throw new Error(`config not found: ${configPath}. Run "shrimpy setup" first.`);
    }
    return { configPath, raw: {} };
  }

  const raw = readJsonFileStrict(
    configPath,
    (parsed) => {
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`config must be a JSON object: ${configPath}`);
      }
      return parsed as Record<string, unknown>;
    },
  );
  return { configPath, raw };
}

export function editConfigFile(
  workspace: string,
  mutate: (raw: Record<string, unknown>) => void,
  opts: ConfigFileEditOptions = {},
): RawConfigFile {
  const file = opts.baseRaw
    ? { configPath: primaryConfigPath(workspace), raw: opts.baseRaw }
    : readConfigFile(workspace, opts);
  mutate(file.raw);
  validateRawConfig(file.raw);
  writeJsonFileAtomic(file.configPath, file.raw);
  return file;
}
