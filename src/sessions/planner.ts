import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import type { ResolvedAgentConfig } from "../config/agents.js";
import { buildTurnContext, renderTurnContext } from "../context/index.js";
import {
  resolveModelVariantInference,
  type ModelVariantInference,
} from "../inference/params.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import type {
  AgentToolPolicy,
  SessionToolPolicy,
} from "../tools/policy.js";
import {
  createSessionToolPolicy,
  resolveAgentToolPolicy,
} from "../tools/policy.js";
import type { SessionBootstrap } from "./bootstrap.js";
import {
  formatMissingAgentModelPolicyMessage,
  resolveModelDetailed,
} from "./models.js";
import type { ModelResolution } from "./models.js";
import {
  createGatewaySessionDescriptor,
  createLocalSessionDescriptor,
  type SessionDescriptor,
  type SessionOpenPlan,
} from "./spec.js";

interface SessionPlannerOpts {
  runtime: AppRuntime;
  bootstrap: SessionBootstrap;
  channelBus: ChannelBus;
  agentId?: string;
}

export interface DirectSessionPlanOverrides {
  label: string;
  channel: string;
  sessionType: string;
  cwd: string;
  provider?: string;
  model?: string;
  modelPolicy?: string;
  thinking?: ThinkingLevel;
  appendSystemPrompt?: string;
  skills?: string[];
  allowMissingModel?: boolean;
  allowRegistryFallbackModel?: boolean;
}

interface GatewayStartupPlan {
  modelResolution: ModelResolution;
  inference?: ModelVariantInference;
}

export class SessionPlanner {
  readonly agentId: string;
  private readonly runtime: AppRuntime;
  private readonly bootstrap: SessionBootstrap;
  private readonly channelBus: ChannelBus;
  private readonly agent: ResolvedAgentConfig;
  private readonly toolPolicy: AgentToolPolicy;
  private readonly sessionToolPolicy: SessionToolPolicy | undefined;
  private readonly gatewayStartup: GatewayStartupPlan;

  constructor(opts: SessionPlannerOpts) {
    this.runtime = opts.runtime;
    this.bootstrap = opts.bootstrap;
    this.channelBus = opts.channelBus;
    this.agent = opts.runtime.getAgent(opts.agentId);
    this.agentId = this.agent.id;
    this.toolPolicy = resolvePlannerToolPolicy(opts.runtime, this.agent);
    this.sessionToolPolicy = createSessionToolPolicy(this.toolPolicy);

    // Gateway sessions reuse this startup resolution until the agent runtime restarts.
    const modelResolution = resolveModelDetailed(
      opts.bootstrap,
      undefined,
      undefined,
      this.agent.modelPolicy,
      {
        missingMessage: formatMissingAgentModelPolicyMessage(this.agent.id),
      },
    );
    this.gatewayStartup = {
      modelResolution,
      inference: resolveModelVariantInference({
        modelsPath: opts.bootstrap.modelsPath,
        model: modelResolution.model,
      }),
    };
  }

  async planDirect(
    overrides: DirectSessionPlanOverrides,
  ): Promise<SessionOpenPlan> {
    process.env.PI_SKIP_VERSION_CHECK = "1";

    // Direct/TUI sessions can restore the saved session model unless the caller supplies an override.
    const restoreModelFromSession = overrides.provider === undefined &&
      overrides.model === undefined &&
      overrides.modelPolicy === undefined;
    const modelResolution = resolveModelDetailed(
      this.bootstrap,
      overrides.provider,
      overrides.model,
      this.agent.modelPolicy,
      {
        modelPolicy: overrides.modelPolicy,
        allowMissingDefault: restoreModelFromSession ||
          overrides.allowMissingModel,
        allowRegistryFallback: overrides.allowRegistryFallbackModel,
        missingMessage: formatMissingAgentModelPolicyMessage(this.agent.id),
      },
    );
    const descriptor = this.createDirectDescriptor(overrides);

    return {
      descriptor,
      restoreModelFromSession,
      allowMissingModel: overrides.allowMissingModel,
      thinking: overrides.thinking,
      inference: resolveModelVariantInference({
        modelsPath: this.bootstrap.modelsPath,
        model: modelResolution.model,
      }),
      defaultThinking: this.agent.thinking,
      prompt: {
        appendSystemPrompt: overrides.appendSystemPrompt,
        skills: overrides.skills,
      },
      prepareTurnContext: async () => {
        const turnContext = await buildTurnContext({
          runtime: this.runtime,
          descriptor,
        });
        return renderTurnContext(turnContext);
      },
      model: modelResolution.model,
      modelResolution,
      toolPolicy: this.sessionToolPolicy,
      tools: await this.buildTools(),
    };
  }

  async planChannel(channel: string): Promise<SessionOpenPlan> {
    const descriptor = this.createGatewayDescriptor(channel);

    return {
      descriptor,
      model: this.gatewayStartup.modelResolution.model,
      modelResolution: this.gatewayStartup.modelResolution,
      inference: this.gatewayStartup.inference,
      defaultThinking: this.agent.thinking,
      tools: await this.buildTools({
        actorId: `agent:${this.agent.id}`,
        activePublicationChannel: channel,
      }),
      toolPolicy: this.sessionToolPolicy,
    };
  }

  createGatewayDescriptor(channel: string): SessionDescriptor {
    return createGatewaySessionDescriptor({
      workspacePath: this.bootstrap.agentRootPath,
      agentId: this.agent.id,
      channel,
    });
  }

  private createDirectDescriptor(
    overrides: DirectSessionPlanOverrides,
  ): SessionDescriptor {
    return createLocalSessionDescriptor({
      workspacePath: this.runtime.getAgentPaths(this.agent.id).root,
      agentId: this.agent.id,
      label: overrides.label,
      kind: overrides.sessionType,
      channel: overrides.channel,
      cwd: overrides.cwd,
    });
  }

  private async buildTools(opts?: {
    actorId?: string;
    activePublicationChannel?: string;
  }): Promise<ToolDefinition[]> {
    return this.runtime.buildRuntimeTools({
      bootstrap: this.bootstrap,
      channelBus: this.channelBus,
      agentId: this.agent.id,
      toolNames: this.toolPolicy.daemonToolNames,
      toolPolicy: this.sessionToolPolicy,
      actorId: opts?.actorId,
      activePublicationChannel: opts?.activePublicationChannel,
    });
  }
}

function resolvePlannerToolPolicy(
  runtime: AppRuntime,
  agent: ResolvedAgentConfig,
): AgentToolPolicy {
  if (typeof runtime.resolveAgentToolPolicy === "function") {
    return runtime.resolveAgentToolPolicy(agent.id);
  }
  return resolveAgentToolPolicy(agent);
}
