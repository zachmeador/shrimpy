import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import type { PromptResourceRef } from "../context/index.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import type { SessionBootstrap } from "./bootstrap.js";
import { openSession } from "./factory.js";
import { SessionPlanner, type DirectSessionPlanOverrides } from "./planner.js";
import type { SessionOpenPlan } from "./spec.js";
import { runSessionTurn } from "./turn-output.js";

export interface OpenDirectSessionInput {
  runtime: AppRuntime;
  agentId?: string;
  channel: string;
  sessionType: string;
  cwd?: string;
  provider?: string;
  model?: string;
  modelPolicy?: string;
  thinking?: ThinkingLevel;
  appendSystemPrompt?: string;
  skills?: string[];
  basePromptResources?: PromptResourceRef[];
  allowMissingModel?: boolean;
  allowRegistryFallbackModel?: boolean;
}

export interface OpenDirectSessionResult {
  agentId: string;
  session: AgentSession;
}

interface RunDirectPromptInput extends OpenDirectSessionInput {
  prompt: string;
}

export interface PreparedDirectSessionOpen {
  agentId: string;
  cwd: string;
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
}

export async function prepareDirectSessionOpen(
  input: OpenDirectSessionInput,
): Promise<PreparedDirectSessionOpen> {
  const cwd = input.cwd ?? process.cwd();
  const agent = input.runtime.getAgent(input.agentId);
  const egressRegistry = input.runtime.createCliEgressRegistry();
  const channelBus = input.runtime.createChannelBus({ egressRegistry });
  const bootstrap = await input.runtime.createBootstrap({
    agentId: agent.id,
    cwd,
    basePromptResources: input.basePromptResources,
  });
  const planner = new SessionPlanner({
    runtime: input.runtime,
    bootstrap,
    channelBus,
    agentId: agent.id,
  });
  const overrides: DirectSessionPlanOverrides = {
    label: input.channel,
    channel: input.channel,
    sessionType: input.sessionType,
    cwd,
    provider: input.provider,
    model: input.model,
    modelPolicy: input.modelPolicy,
    thinking: input.thinking,
    appendSystemPrompt: input.appendSystemPrompt,
    skills: input.skills,
    allowMissingModel: input.allowMissingModel,
    allowRegistryFallbackModel: input.allowRegistryFallbackModel,
  };
  const plan = await planner.planDirect(overrides);

  return {
    agentId: agent.id,
    cwd,
    bootstrap,
    plan,
  };
}

export async function openDirectAgentSession(
  input: OpenDirectSessionInput,
): Promise<OpenDirectSessionResult> {
  const prepared = await prepareDirectSessionOpen(input);
  const session = await openSession(prepared.bootstrap, prepared.plan);

  return {
    agentId: prepared.agentId,
    session,
  };
}

export async function runDirectAgentPrompt(
  input: RunDirectPromptInput,
): Promise<{ agentId: string; output: string }> {
  const { agentId, session } = await openDirectAgentSession(input);

  try {
    const { assistantText: output } = await runSessionTurn(
      session,
      input.prompt,
    );
    return { agentId, output };
  } finally {
    session.dispose();
  }
}
