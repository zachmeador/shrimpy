import type { AppRuntime } from "../app/runtime.js";
import {
  addAgentToWorkspace,
  type AddAgentInput,
  type AddAgentResult,
  editAgentAttentionInWorkspace,
  type EditAgentAttentionInput,
  type EditAgentAttentionResult,
  removeAgentFromWorkspace,
  type RemoveAgentInput,
  type RemoveAgentResult,
  renameAgentInWorkspace,
  type RenameAgentInput,
  type RenameAgentResult,
  updateAgentInWorkspace,
  type UpdateAgentInput,
  type UpdateAgentResult,
} from "./workspace-manager.js";

export function listAgentViews(runtime: AppRuntime) {
  return runtime.resolved.agents.map((agent) => ({
    ...agent,
    paths: runtime.getAgentPaths(agent.id),
  }));
}

export function getAgentView(runtime: AppRuntime, agentId: string) {
  const agent = runtime.getAgent(agentId);
  return {
    ...agent,
    paths: runtime.getAgentPaths(agent.id),
  };
}

export function addAgent(runtime: AppRuntime, input: AddAgentInput): AddAgentResult {
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
      ...(input.model !== undefined ? ["model"] : []),
      ...(input.tools !== undefined ? ["tools"] : []),
      ...(input.thinking !== undefined ? ["thinking"] : []),
      ...(input.attention !== undefined ? ["attention"] : []),
    ],
  });
  return result;
}

export function editAgentAttention(
  runtime: AppRuntime,
  input: EditAgentAttentionInput,
): EditAgentAttentionResult {
  const result = editAgentAttentionInWorkspace(runtime, input);
  publishLifecycleEvent(runtime, {
    kind: "agent_updated",
    agentId: input.agentId,
    updatedFields: ["attention"],
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
