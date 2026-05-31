import {
  InteractiveMode,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import { buildTurnContext } from "../context/index.js";
import {
  composePromptWithBriefing,
  renderTurnContext,
  type PromptResourceRef,
} from "../context/index.js";
import {
  resolveModelVariantInference,
} from "../inference/params.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import { createSessionToolPolicy } from "../tools/policy.js";
import { installShrimpyActivityIndicator } from "../tui/shrimpy-activity-indicator.js";
import { installShrimpyCommandSurface } from "../tui/shrimpy-command-surface.js";
import { installShrimpyContextRendering } from "../tui/shrimpy-context-rendering.js";
import { installShrimpyModelSelectionGuard } from "../tui/shrimpy-model-selection.js";
import { installShrimpySettingsSelector } from "../tui/shrimpy-settings.js";
import {
  formatMissingAgentModelMessage,
  openSession,
  openSessionRuntime,
  resolveModel,
} from "./factory.js";
import { createLocalSessionDescriptor } from "./spec.js";
import { runSessionTurn } from "./turn-output.js";

export interface OpenDirectSessionInput {
  runtime: AppRuntime;
  agentId?: string;
  channel: string;
  sessionType: string;
  cwd?: string;
  provider?: string;
  model?: string;
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

export interface RunDirectPromptInput extends OpenDirectSessionInput {
  prompt: string;
}

export interface RunInteractiveSessionInput extends OpenDirectSessionInput {
  initialMessage?: string;
}

export async function openDirectAgentSession(
  input: OpenDirectSessionInput,
): Promise<OpenDirectSessionResult> {
  const cwd = input.cwd ?? process.cwd();
  const agent = input.runtime.getAgent(input.agentId);
  const egressRegistry = input.runtime.createCliEgressRegistry();
  const channelBus = input.runtime.createChannelBus({ egressRegistry });
  const bootstrap = await input.runtime.createBootstrap({
    agentId: agent.id,
    cwd,
    basePromptResources: input.basePromptResources,
  });
  const restoreModelFromSession = input.provider === undefined && input.model === undefined;
  const model = resolveModel(
    bootstrap,
    input.provider,
    input.model,
    agent.model,
    {
      allowMissingDefault: restoreModelFromSession || input.allowMissingModel,
      allowRegistryFallback: input.allowRegistryFallbackModel,
      missingMessage: formatMissingAgentModelMessage(agent.id),
    },
  );
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
  const session = await openSession(bootstrap, {
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
    preparePrompt: async (text) => {
      const briefing = await buildTurnContext({
        runtime: input.runtime,
        descriptor,
      });
      return composePromptWithBriefing(text, renderTurnContext(briefing));
    },
    model,
    toolPolicy: sessionToolPolicy,
    tools: input.runtime.buildRuntimeTools({
      bootstrap,
      channelBus,
      agentId: agent.id,
      toolNames: toolPolicy.daemonToolNames,
      toolPolicy: sessionToolPolicy,
      activeChannel: input.channel,
    }),
  });

  return {
    agentId: agent.id,
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

export async function runInteractiveAgentSession(
  input: RunInteractiveSessionInput,
): Promise<{ agentId: string }> {
  return runAgentTuiSession(input, "shrimpy");
}

export async function runPiInteractiveAgentSession(
  input: RunInteractiveSessionInput,
): Promise<{ agentId: string }> {
  return runAgentTuiSession(input, "pi");
}

async function runAgentTuiSession(
  input: RunInteractiveSessionInput,
  mode: "pi" | "shrimpy",
): Promise<{ agentId: string }> {
  const cwd = input.cwd ?? process.cwd();
  const agent = input.runtime.getAgent(input.agentId);
  const egressRegistry = input.runtime.createCliEgressRegistry();
  const channelBus = input.runtime.createChannelBus({ egressRegistry });
  const bootstrap = await input.runtime.createBootstrap({
    agentId: agent.id,
    cwd,
    basePromptResources: input.basePromptResources,
  });
  const restoreModelFromSession = input.provider === undefined && input.model === undefined;
  const model = resolveModel(
    bootstrap,
    input.provider,
    input.model,
    agent.model,
    {
      allowMissingDefault: restoreModelFromSession || input.allowMissingModel,
      allowRegistryFallback: input.allowRegistryFallbackModel,
      missingMessage: formatMissingAgentModelMessage(agent.id),
    },
  );
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
  const runtime = await openSessionRuntime(bootstrap, {
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
    preparePrompt: async (text) => {
      const briefing = await buildTurnContext({
        runtime: input.runtime,
        descriptor,
      });
      return composePromptWithBriefing(text, renderTurnContext(briefing));
    },
    model,
    toolPolicy: sessionToolPolicy,
    tools: input.runtime.buildRuntimeTools({
      bootstrap,
      channelBus,
      agentId: agent.id,
      toolNames: toolPolicy.daemonToolNames,
      toolPolicy: sessionToolPolicy,
      activeChannel: input.channel,
    }),
  });

  try {
    const interactive = new InteractiveMode(runtime, {
      initialMessage: input.initialMessage,
    });
    if (mode === "shrimpy") {
      installShrimpyActivityIndicator(interactive);
      installShrimpyCommandSurface(interactive, {
        runtime: input.runtime,
        agentId: agent.id,
        channel: input.channel,
        sessionType: input.sessionType,
        cwd,
      });
      installShrimpyContextRendering(interactive);
      installShrimpyModelSelectionGuard(interactive, { runtime: input.runtime });
      installShrimpySettingsSelector(interactive, {
        runtime: input.runtime,
        agentId: agent.id,
        channel: input.channel,
        sessionType: input.sessionType,
        cwd,
      });
    }
    await interactive.run();
    return { agentId: agent.id };
  } finally {
    await runtime.dispose();
  }
}
