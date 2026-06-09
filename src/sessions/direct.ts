import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import { buildTurnContext } from "../context/index.js";
import {
  renderTurnContext,
  type PromptResourceRef,
} from "../context/index.js";
import {
  resolveModelVariantInference,
} from "../inference/params.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import { createSessionToolPolicy } from "../tools/policy.js";
import type { SessionBootstrap } from "./bootstrap.js";
import {
  formatMissingAgentModelPolicyMessage,
  openSession,
  resolveModelDetailed,
} from "./factory.js";
import {
  createLocalSessionDescriptor,
  type SessionOpenPlan,
} from "./spec.js";
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
  const restoreModelFromSession = input.provider === undefined &&
    input.model === undefined &&
    input.modelPolicy === undefined;
  const modelResolution = resolveModelDetailed(
    bootstrap,
    input.provider,
    input.model,
    agent.modelPolicy,
    {
      modelPolicy: input.modelPolicy,
      allowMissingDefault: restoreModelFromSession || input.allowMissingModel,
      allowRegistryFallback: input.allowRegistryFallbackModel,
      missingMessage: formatMissingAgentModelPolicyMessage(agent.id),
    },
  );
  const model = modelResolution.model;
  const inference = resolveModelVariantInference({
    modelsPath: bootstrap.modelsPath,
    model,
  });
  const defaultThinking = agent.thinking;
  const toolPolicy = input.runtime.resolveAgentToolPolicy(agent.id);
  const sessionToolPolicy = createSessionToolPolicy(toolPolicy);

  process.env.PI_SKIP_VERSION_CHECK = "1";

  const descriptor = createLocalSessionDescriptor({
    workspacePath: input.runtime.getAgentPaths(agent.id).root,
    agentId: agent.id,
    label: input.channel,
    kind: input.sessionType,
    channel: input.channel,
    cwd,
  });
  const tools = await input.runtime.buildRuntimeTools({
    bootstrap,
    channelBus,
    agentId: agent.id,
    toolNames: toolPolicy.daemonToolNames,
    toolPolicy: sessionToolPolicy,
  });

  return {
    agentId: agent.id,
    cwd,
    bootstrap,
    plan: {
      descriptor,
      restoreModelFromSession,
      allowMissingModel: input.allowMissingModel,
      thinking: input.thinking,
      inference,
      defaultThinking,
      prompt: {
        appendSystemPrompt: input.appendSystemPrompt,
        skills: input.skills,
      },
      prepareTurnContext: async () => {
        const turnContext = await buildTurnContext({
          runtime: input.runtime,
          descriptor,
        });
        return renderTurnContext(turnContext);
      },
      model,
      modelResolution,
      toolPolicy: sessionToolPolicy,
      tools,
    },
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
