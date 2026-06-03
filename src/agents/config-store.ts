import { existsSync } from "node:fs";
import {
  type AgentChannelPolicyConfig,
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
  disabledTools?: string[];
  thinking?: ThinkingLevel;
  channelPolicy?: AgentChannelPolicyConfig;
}

export interface AgentConfigPatch {
  root?: string;
  model?: ModelSelectionConfig;
  tools?: string[];
  disabledTools?: string[];
  thinking?: ThinkingLevel;
  channelPolicy?: AgentChannelPolicyConfig;
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
  const agent: AgentConfig = {
    id: input.agentId,
    root: input.root ?? `agents/${input.agentId}`,
    ...(input.model !== undefined ? { model: input.model } : {}),
    tools: [...new Set(input.tools)],
    ...(input.disabledTools?.length
      ? { disabledTools: [...new Set(input.disabledTools)] }
      : {}),
    ...(input.thinking !== undefined ? { thinking: input.thinking } : {}),
    ...(input.channelPolicy !== undefined ? { channelPolicy: input.channelPolicy } : {}),
  };
  return agent;
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
  const next: AgentConfig = {
    ...agent,
    ...(patch.root !== undefined ? { root: patch.root } : {}),
    ...(patch.model !== undefined ? { model: patch.model } : {}),
    ...(patch.tools !== undefined ? { tools: [...new Set(patch.tools)] } : {}),
  };
  if (patch.disabledTools !== undefined) {
    const disabledTools = [...new Set(patch.disabledTools)];
    if (disabledTools.length > 0) {
      next.disabledTools = disabledTools;
    } else {
      delete next.disabledTools;
    }
  }
  if (patch.thinking !== undefined) next.thinking = patch.thinking;
  if (patch.channelPolicy !== undefined) next.channelPolicy = patch.channelPolicy;
  return next;
}
