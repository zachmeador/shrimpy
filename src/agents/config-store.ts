import {
  type AgentChannelPolicyConfig,
  type AgentConfig,
  validateAgentsConfig,
} from "../config/agents.js";
import {
  editConfigFile,
  readConfigFile,
} from "../config/store.js";
import type { ThinkingLevel } from "../thinking.js";

export interface AgentWorkspaceConfig {
  workspace: string;
  configPath: string;
  raw: Record<string, unknown>;
  agents: AgentConfig[];
}

export interface AgentConfigDraft {
  agentId: string;
  root?: string;
  cwd?: string;
  modelPolicy?: string;
  tools: string[];
  disabledTools?: string[];
  thinking?: ThinkingLevel;
  channelPolicy?: AgentChannelPolicyConfig;
}

export interface AgentConfigPatch {
  root?: string;
  cwd?: string;
  modelPolicy?: string;
  tools?: string[];
  disabledTools?: string[];
  thinking?: ThinkingLevel;
  channelPolicy?: AgentChannelPolicyConfig;
}

export function readAgentWorkspaceConfig(workspace: string): AgentWorkspaceConfig {
  const { configPath, raw } = readConfigFile(workspace, { missing: "error" });
  const agents = raw.agents === undefined ? [] : validateAgentsConfig(raw.agents);
  return { workspace, configPath, raw, agents };
}

export function writeAgentWorkspaceConfig(
  editable: AgentWorkspaceConfig,
): void {
  editConfigFile(editable.workspace, (raw) => {
    for (const key of Object.keys(raw)) delete raw[key];
    Object.assign(raw, editable.raw);
  }, { missing: "error" });
}

export function createAgentConfig(input: AgentConfigDraft): AgentConfig {
  const agent: AgentConfig = {
    id: input.agentId,
    root: input.root ?? `agents/${input.agentId}`,
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.modelPolicy !== undefined ? { modelPolicy: input.modelPolicy } : {}),
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
  const defaultCwd = defaultRoot;

  return {
    ...agent,
    id: toAgentId,
    ...(agent.root
      ? { root: agent.root === defaultRoot ? `agents/${toAgentId}` : agent.root }
      : {}),
    ...(agent.cwd
      ? { cwd: agent.cwd === defaultCwd ? `agents/${toAgentId}` : agent.cwd }
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
    ...(patch.cwd !== undefined ? { cwd: patch.cwd } : {}),
    ...(patch.modelPolicy !== undefined ? { modelPolicy: patch.modelPolicy } : {}),
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
