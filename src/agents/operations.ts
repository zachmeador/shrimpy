import type { AppRuntime } from "../app/runtime.js";
import { createAgentPaths } from "../workspace/paths.js";
import {
  type AgentChannelPolicyConfig,
  type AgentConfig,
  DEFAULT_AGENT_ID,
  validateAgentsConfig,
} from "../config/agents.js";
import {
  type ChannelPolicyEdit,
  editChannelPolicyConfig,
} from "./channel-policy-edit.js";
import {
  createAgentConfig,
  type AgentConfigDraft,
  patchStoredAgentConfig,
  readAgentWorkspaceConfig,
  renameStoredAgentConfig,
  writeAgentWorkspaceConfig,
} from "./config-store.js";
import {
  deleteAgentWorkspaceFiles,
  moveAgentWorkspaceFiles,
  scaffoldAgentFiles,
} from "./workspace-files.js";
import { resolveAgentToolPolicy } from "../tools/policy.js";

export interface AddAgentResult {
  configPath: string;
  agent: AgentConfig;
  rootPath: string;
}

export interface RemoveAgentInput {
  agentId: string;
  deleteFiles?: boolean;
}

export interface RemoveAgentResult {
  configPath: string;
  removedAgent: AgentConfig;
  rootPath: string;
  removedFromChannels: string[];
  clearedSurfaceThreadCount: number;
  deletedPaths: string[];
}

export interface RenameAgentInput {
  fromAgentId: string;
  toAgentId: string;
}

export interface RenameAgentResult {
  configPath: string;
  renamedAgent: AgentConfig;
  previousAgent: AgentConfig;
  rootPath: string;
  movedPaths: Array<{ from: string; to: string }>;
  updatedChannels: string[];
  updatedSurfaceThreadCount: number;
}

export interface UpdateAgentInput {
  agentId: string;
  root?: string;
  cwd?: AgentConfig["cwd"];
  modelPolicy?: AgentConfig["modelPolicy"];
  tools?: string[];
  disabledTools?: string[];
  thinking?: AgentConfig["thinking"];
  knowledgeScope?: AgentConfig["knowledgeScope"];
  channelPolicy?: AgentConfig["channelPolicy"];
}

export interface UpdateAgentResult {
  configPath: string;
  previousAgent: AgentConfig;
  updatedAgent: AgentConfig;
  rootPath: string;
  movedPaths: Array<{ from: string; to: string }>;
}

export interface EditAgentChannelPolicyInput {
  agentId: string;
  edit: ChannelPolicyEdit;
}

export interface EditAgentChannelPolicyResult {
  configPath: string;
  previousChannelPolicy?: AgentChannelPolicyConfig;
  nextChannelPolicy: AgentChannelPolicyConfig | null;
}

function addAgentToWorkspace(
  runtime: AppRuntime,
  input: AgentConfigDraft,
): AddAgentResult {
  const editable = readAgentWorkspaceConfig(runtime.config.workspace);

  if (editable.agents.some((agent) => agent.id === input.agentId)) {
    throw new Error(`agent already exists: ${input.agentId}`);
  }

  const nextAgent = createAgentConfig(input);
  const nextAgents = [...editable.agents, nextAgent];
  persistAgentConfigs(editable, nextAgents);

  scaffoldAgentFiles(
    runtime.config.workspace,
    nextAgent.root ?? `agents/${input.agentId}`,
    input.agentId,
  );

  const paths = createAgentPaths(
    runtime.config.workspace,
    nextAgent.root ?? `agents/${input.agentId}`,
  );

  return {
    configPath: editable.configPath,
    agent: nextAgent,
    rootPath: paths.root,
  };
}

function removeAgentFromWorkspace(
  runtime: AppRuntime,
  input: RemoveAgentInput,
): RemoveAgentResult {
  if (input.agentId === DEFAULT_AGENT_ID) {
    throw new Error(`cannot remove default agent: ${DEFAULT_AGENT_ID}`);
  }

  const editable = readAgentWorkspaceConfig(runtime.config.workspace);
  const existingAgent = editable.agents.find((agent) => agent.id === input.agentId);
  if (!existingAgent) {
    throw new Error(`agent not found: ${input.agentId}`);
  }

  persistAgentConfigs(
    editable,
    editable.agents.filter((agent) => agent.id !== input.agentId),
  );

  const paths = createAgentPaths(
    runtime.config.workspace,
    existingAgent.root ?? `agents/${input.agentId}`,
  );

  const removedFromChannels = runtime.createChannelMembershipStore()
    .removeAgentEverywhere(input.agentId);
  const clearedThreads = runtime.createSurfaceThreadStateStore()
    .clearAddressedAgentEverywhere(input.agentId);

  const deletedPaths = input.deleteFiles
    ? deleteAgentWorkspaceFiles(
      paths,
    )
    : [];

  return {
    configPath: editable.configPath,
    removedAgent: existingAgent,
    rootPath: paths.root,
    removedFromChannels,
    clearedSurfaceThreadCount: clearedThreads.length,
    deletedPaths,
  };
}

function renameAgentInWorkspace(
  runtime: AppRuntime,
  input: RenameAgentInput,
): RenameAgentResult {
  if (input.fromAgentId === DEFAULT_AGENT_ID) {
    throw new Error(`cannot rename default agent: ${DEFAULT_AGENT_ID}`);
  }

  const editable = readAgentWorkspaceConfig(runtime.config.workspace);
  const existingAgent = editable.agents.find((agent) => agent.id === input.fromAgentId);
  if (!existingAgent) {
    throw new Error(`agent not found: ${input.fromAgentId}`);
  }
  if (editable.agents.some((agent) => agent.id === input.toAgentId)) {
    throw new Error(`agent already exists: ${input.toAgentId}`);
  }

  const nextAgent = renameStoredAgentConfig(
    existingAgent,
    input.fromAgentId,
    input.toAgentId,
  );
  persistAgentConfigs(
    editable,
    editable.agents.map((agent) =>
      agent.id === input.fromAgentId ? nextAgent : agent
    ),
  );

  const previousPaths = createAgentPaths(
    runtime.config.workspace,
    existingAgent.root ?? `agents/${input.fromAgentId}`,
  );
  const nextPaths = createAgentPaths(
    runtime.config.workspace,
    nextAgent.root ?? `agents/${input.toAgentId}`,
  );

  const movedPaths = moveAgentWorkspaceFiles(previousPaths, nextPaths);
  const updatedChannels = runtime.createChannelMembershipStore()
    .renameAgentEverywhere(input.fromAgentId, input.toAgentId);
  const updatedThreads = runtime.createSurfaceThreadStateStore()
    .renameAddressedAgentEverywhere(input.fromAgentId, input.toAgentId);

  return {
    configPath: editable.configPath,
    renamedAgent: nextAgent,
    previousAgent: existingAgent,
    rootPath: nextPaths.root,
    movedPaths,
    updatedChannels,
    updatedSurfaceThreadCount: updatedThreads.length,
  };
}

function updateAgentInWorkspace(
  runtime: AppRuntime,
  input: UpdateAgentInput,
): UpdateAgentResult {
  const editable = readAgentWorkspaceConfig(runtime.config.workspace);
  const existingAgent = editable.agents.find((agent) => agent.id === input.agentId);
  if (!existingAgent) {
    throw new Error(`agent not found: ${input.agentId}`);
  }

  const nextAgent = patchStoredAgentConfig(existingAgent, {
    ...(input.root !== undefined ? { root: input.root } : {}),
    ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
    ...(input.modelPolicy !== undefined ? { modelPolicy: input.modelPolicy } : {}),
    ...(input.tools !== undefined ? { tools: input.tools } : {}),
    ...(input.disabledTools !== undefined ? { disabledTools: input.disabledTools } : {}),
    ...(input.thinking !== undefined ? { thinking: input.thinking } : {}),
    ...(input.knowledgeScope !== undefined
      ? { knowledgeScope: input.knowledgeScope }
      : {}),
    ...(input.channelPolicy !== undefined ? { channelPolicy: input.channelPolicy } : {}),
  });
  persistAgentConfigs(
    editable,
    editable.agents.map((agent) =>
      agent.id === input.agentId ? nextAgent : agent
    ),
  );

  const previousPaths = createAgentPaths(
    runtime.config.workspace,
    existingAgent.root ?? `agents/${input.agentId}`,
  );
  const nextPaths = createAgentPaths(
    runtime.config.workspace,
    nextAgent.root ?? `agents/${input.agentId}`,
  );

  const movedPaths = moveAgentWorkspaceFiles(previousPaths, nextPaths);
  return {
    configPath: editable.configPath,
    previousAgent: existingAgent,
    updatedAgent: nextAgent,
    rootPath: nextPaths.root,
    movedPaths,
  };
}

function editAgentChannelPolicyInWorkspace(
  runtime: AppRuntime,
  input: EditAgentChannelPolicyInput,
): EditAgentChannelPolicyResult {
  const editable = readAgentWorkspaceConfig(runtime.config.workspace);
  const existingAgent = editable.agents.find((agent) => agent.id === input.agentId);
  if (!existingAgent) {
    throw new Error(`agent not found: ${input.agentId}`);
  }

  const nextChannelPolicy = editChannelPolicyConfig(
    existingAgent.channelPolicy,
    input.edit,
  );
  const nextAgent = patchStoredAgentConfig(existingAgent, {
    channelPolicy: nextChannelPolicy ?? {},
  });
  if (nextChannelPolicy === null) {
    delete nextAgent.channelPolicy;
  }
  persistAgentConfigs(
    editable,
    editable.agents.map((agent) =>
      agent.id === input.agentId ? nextAgent : agent
    ),
  );

  return {
    configPath: editable.configPath,
    previousChannelPolicy: existingAgent.channelPolicy,
    nextChannelPolicy,
  };
}

export function listAgentViews(runtime: AppRuntime) {
  return runtime.resolved.agents.map((agent) => ({
    ...agent,
    cwdPath: runtime.getAgentCwd(agent.id),
    paths: runtime.getAgentPaths(agent.id),
    toolPolicy: resolveAgentToolPolicy(agent),
  }));
}

export function getAgentView(runtime: AppRuntime, agentId: string) {
  const agent = runtime.getAgent(agentId);
  return {
    ...agent,
    cwdPath: runtime.getAgentCwd(agent.id),
    paths: runtime.getAgentPaths(agent.id),
    toolPolicy: resolveAgentToolPolicy(agent),
  };
}

export function addAgent(runtime: AppRuntime, input: AgentConfigDraft): AddAgentResult {
  const result = addAgentToWorkspace(runtime, input);
  publishLifecycleEvent(runtime, {
    kind: "agent_added",
    agentId: input.agentId,
  });
  return result;
}

export function removeAgent(
  runtime: AppRuntime,
  input: RemoveAgentInput,
): RemoveAgentResult {
  const result = removeAgentFromWorkspace(runtime, input);
  publishLifecycleEvent(runtime, {
    kind: "agent_removed",
    agentId: input.agentId,
    deletedFiles: input.deleteFiles ?? false,
  });
  return result;
}

export function renameAgent(
  runtime: AppRuntime,
  input: RenameAgentInput,
): RenameAgentResult {
  const result = renameAgentInWorkspace(runtime, input);
  publishLifecycleEvent(runtime, {
    kind: "agent_renamed",
    fromAgentId: input.fromAgentId,
    toAgentId: input.toAgentId,
  });
  return result;
}

export function updateAgent(
  runtime: AppRuntime,
  input: UpdateAgentInput,
): UpdateAgentResult {
  const result = updateAgentInWorkspace(runtime, input);
  publishLifecycleEvent(runtime, {
    kind: "agent_updated",
    agentId: input.agentId,
    updatedFields: [
      ...(input.root !== undefined ? ["root"] : []),
      ...(input.cwd !== undefined ? ["cwd"] : []),
      ...(input.modelPolicy !== undefined ? ["modelPolicy"] : []),
      ...(input.tools !== undefined ? ["tools"] : []),
      ...(input.disabledTools !== undefined ? ["disabledTools"] : []),
      ...(input.thinking !== undefined ? ["thinking"] : []),
      ...(input.knowledgeScope !== undefined ? ["knowledgeScope"] : []),
      ...(input.channelPolicy !== undefined ? ["channelPolicy"] : []),
    ],
  });
  return result;
}

export function editAgentChannelPolicy(
  runtime: AppRuntime,
  input: EditAgentChannelPolicyInput,
): EditAgentChannelPolicyResult {
  const result = editAgentChannelPolicyInWorkspace(runtime, input);
  publishLifecycleEvent(runtime, {
    kind: "agent_updated",
    agentId: input.agentId,
    updatedFields: ["channelPolicy"],
  });
  return result;
}

function publishLifecycleEvent(
  runtime: AppRuntime,
  data: Record<string, unknown>,
): void {
  runtime.createChannelBus().publishSystem({
    channel: "home",
    actorId: "system:cli",
    transport: "cli",
    data,
  });
}

function persistAgentConfigs(
  editable: ReturnType<typeof readAgentWorkspaceConfig>,
  nextAgents: AgentConfig[],
): void {
  validateAgentsConfig(nextAgents);
  editable.raw.agents = nextAgents;
  writeAgentWorkspaceConfig(editable);
}
