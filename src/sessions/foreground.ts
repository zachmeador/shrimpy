import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import type { PromptResourceRef } from "../context/index.js";
import type { ThinkingLevel } from "./thinking.js";
import type { SessionBootstrap } from "./bootstrap.js";
import { openSession } from "./factory.js";
import type { SessionNamespace } from "./identity.js";
import { createSessionKey } from "./identity.js";
import { SessionResolver } from "./resolver.js";
import type { SessionOpenPlan } from "./spec.js";
import { runSessionTurn } from "./turn-output.js";

export interface OpenForegroundSessionInput {
  runtime: AppRuntime;
  agentId?: string;
  session: {
    namespace: SessionNamespace;
    name: string;
    profileId?: string;
  };
  purpose: string;
  persistent?: boolean;
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

export interface OpenForegroundSessionResult {
  agentId: string;
  session: AgentSession;
}

interface RunForegroundPromptInput extends OpenForegroundSessionInput {
  prompt: string;
}

export interface PreparedForegroundSessionOpen {
  agentId: string;
  cwd: string;
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
}

export async function prepareForegroundSessionOpen(
  input: OpenForegroundSessionInput,
): Promise<PreparedForegroundSessionOpen> {
  const agent = input.runtime.getAgent(input.agentId);
  const cwd = input.cwd ?? input.runtime.getAgentCwd(agent.id);
  const egressRegistry = input.runtime.createCliEgressRegistry();
  const channelBus = input.runtime.createChannelBus({ egressRegistry });
  const bootstrap = await input.runtime.createBootstrap({
    agentId: agent.id,
    cwd,
    basePromptResources: input.basePromptResources,
  });
  const resolver = new SessionResolver({
    runtime: input.runtime,
    bootstrap,
    channelBus,
    agentId: agent.id,
  });
  const plan = await resolver.resolve({
    key: createSessionKey({ agentId: agent.id, ...input.session }),
    purpose: input.purpose,
    delivery: { kind: "transcript" },
    persistent: input.persistent,
    cwd,
    provider: input.provider,
    model: input.model,
    modelPolicy: input.modelPolicy,
    thinking: input.thinking,
    appendSystemPrompt: input.appendSystemPrompt,
    skills: input.skills,
    allowMissingModel: input.allowMissingModel,
    allowRegistryFallbackModel: input.allowRegistryFallbackModel,
  });

  return { agentId: agent.id, cwd, bootstrap, plan };
}

export async function openForegroundAgentSession(
  input: OpenForegroundSessionInput,
): Promise<OpenForegroundSessionResult> {
  const prepared = await prepareForegroundSessionOpen(input);
  const session = await openSession(prepared.bootstrap, prepared.plan);
  return { agentId: prepared.agentId, session };
}

export async function runForegroundAgentPrompt(
  input: RunForegroundPromptInput,
): Promise<{ agentId: string; output: string }> {
  const { agentId, session } = await openForegroundAgentSession(input);
  try {
    const { assistantText: output } = await runSessionTurn(session, input.prompt);
    return { agentId, output };
  } finally {
    session.dispose();
  }
}
