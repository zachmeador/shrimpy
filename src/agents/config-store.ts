import { existsSync } from "node:fs";
import {
  type AgentAttentionConfig,
  type AgentConfig,
  validateAgentsConfig,
} from "../config/agents.js";
import type { ModelSelectionConfig } from "../config/model.js";
import { primaryConfigPath } from "../config/index.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import {
  readJsonFileStrict,
  writeJsonFileAtomic,
} from "../util/json-file.js";

export interface AgentWorkspaceConfig {
  configPath: string;
  raw: Record<string, unknown>;
  agents: AgentConfig[];
}

export interface AgentConfigDraft {
  agentId: string;
  root?: string;
  model?: ModelSelectionConfig;
  tools: string[];
  thinking?: ThinkingLevel;
  attention?: AgentAttentionConfig;
}

export interface AgentConfigPatch {
  root?: string;
  model?: ModelSelectionConfig;
  tools?: string[];
  thinking?: ThinkingLevel;
  attention?: AgentAttentionConfig;
}

export function readAgentWorkspaceConfig(workspace: string): AgentWorkspaceConfig {
  const configPath = primaryConfigPath(workspace);
  if (!existsSync(configPath)) {
    throw new Error(`config not found: ${configPath}. Run "shrimpy setup init" first.`);
  }

  const raw = readJsonFileStrict(
    configPath,
    (parsed) => parsed as Record<string, unknown>,
  );
  const agents = raw.agents === undefined ? [] : validateAgentsConfig(raw.agents);
  return { configPath, raw, agents };
}

export function writeAgentWorkspaceConfig(
  configPath: string,
  raw: Record<string, unknown>,
): void {
  writeJsonFileAtomic(configPath, raw);
}

export function createAgentConfig(input: AgentConfigDraft): AgentConfig {
  return {
    id: input.agentId,
    root: input.root ?? `agents/${input.agentId}`,
    ...(input.model !== undefined ? { model: input.model } : {}),
    tools: [...new Set(input.tools)],
    ...(input.thinking !== undefined ? { thinking: input.thinking } : {}),
    ...(input.attention !== undefined ? { attention: input.attention } : {}),
  };
}

export function renameStoredAgentConfig(
  agent: AgentConfig,
  fromAgentId: string,
  toAgentId: string,
): AgentConfig {
  const defaultRoot = `agents/${fromAgentId}`;

  return {
    ...agent,
    id: toAgentId,
    ...(agent.root
      ? { root: agent.root === defaultRoot ? `agents/${toAgentId}` : agent.root }
      : {}),
  };
}

export function patchStoredAgentConfig(
  agent: AgentConfig,
  patch: AgentConfigPatch,
): AgentConfig {
  return {
    ...agent,
    ...(patch.root !== undefined ? { root: patch.root } : {}),
    ...(patch.model !== undefined ? { model: patch.model } : {}),
    ...(patch.tools !== undefined ? { tools: [...new Set(patch.tools)] } : {}),
    ...(patch.thinking !== undefined ? { thinking: patch.thinking } : {}),
    ...(patch.attention !== undefined ? { attention: patch.attention } : {}),
  };
}
