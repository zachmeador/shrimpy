import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import type { ResolvedAgentConfig } from "../config/agents.js";
import { buildTurnContext } from "../context/turn/builder.js";
import { renderTurnContext } from "../context/turn/render.js";
import type { ThinkingLevel } from "../config/thinking.js";
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
  resolveSessionModel,
  shouldRestoreSavedSessionModel,
} from "./models.js";
import type { SessionModelRequest } from "./model-types.js";
import type { SessionKey } from "./identity.js";
import {
  createSessionDescriptor,
  type SessionDelivery,
  type SessionDescriptor,
  type SessionOpenPlan,
} from "./spec.js";

interface SessionResolverOptions {
  runtime: AppRuntime;
  bootstrap: SessionBootstrap;
  channelBus: ChannelBus;
  agentId?: string;
}

export interface ResolveSessionInput {
  key: SessionKey;
  purpose: string;
  delivery: SessionDelivery;
  persistent?: boolean;
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

export class SessionResolver {
  readonly agentId: string;
  private readonly runtime: AppRuntime;
  private readonly bootstrap: SessionBootstrap;
  private readonly channelBus: ChannelBus;
  private readonly agent: ResolvedAgentConfig;
  private readonly toolPolicy: AgentToolPolicy;
  private readonly sessionToolPolicy: SessionToolPolicy | undefined;

  constructor(options: SessionResolverOptions) {
    this.runtime = options.runtime;
    this.bootstrap = options.bootstrap;
    this.channelBus = options.channelBus;
    this.agent = options.runtime.getAgent(options.agentId);
    this.agentId = this.agent.id;
    this.toolPolicy = resolveResolverToolPolicy(options.runtime, this.agent);
    this.sessionToolPolicy = createSessionToolPolicy(this.toolPolicy);
  }

  async resolve(input: ResolveSessionInput): Promise<SessionOpenPlan> {
    process.env.PI_SKIP_VERSION_CHECK = "1";
    if (input.key.agentId !== this.agent.id) {
      throw new Error(
        `session key agent ${input.key.agentId} does not match resolver agent ${this.agent.id}`,
      );
    }

    const descriptor = this.descriptor(input);
    const modelRequest = this.modelRequest(input);
    const restoreModelFromSession = input.persistent !== false &&
      shouldRestoreSavedSessionModel(modelRequest);
    const modelResolution = resolveSessionModel({
      bootstrap: this.bootstrap,
      ...modelRequest,
      allowMissingModel: restoreModelFromSession || input.allowMissingModel,
    });

    return {
      descriptor,
      modelRequest,
      restoreModelFromSession,
      allowMissingModel: input.allowMissingModel,
      thinking: input.thinking,
      defaultThinking: this.agent.thinking,
      prompt: {
        appendSystemPrompt: input.appendSystemPrompt,
        skills: input.skills,
      },
      prepareTurnContext: async (prompt) => {
        const turnContext = await buildTurnContext({
          runtime: this.runtime,
          descriptor,
          currentPrompt: prompt,
        });
        return renderTurnContext(turnContext);
      },
      model: modelResolution.model,
      modelResolution,
      toolPolicy: this.sessionToolPolicy,
      tools: await this.buildTools(descriptor),
    };
  }

  descriptor(input: Pick<ResolveSessionInput, "key" | "purpose" | "delivery" | "persistent" | "cwd">): SessionDescriptor {
    return createSessionDescriptor({
      agentRoot: this.runtime.getAgentPaths(this.agent.id).root,
      key: input.key,
      purpose: input.purpose,
      delivery: input.delivery,
      persistent: input.persistent,
      cwd: input.cwd,
    });
  }

  private modelRequest(
    input: Pick<
      ResolveSessionInput,
      | "provider"
      | "model"
      | "modelPolicy"
      | "allowMissingModel"
      | "allowRegistryFallbackModel"
    >,
  ): SessionModelRequest {
    return {
      provider: input.provider,
      model: input.model,
      modelPolicy: input.modelPolicy,
      defaultModelPolicy: this.agent.modelPolicy,
      allowMissingModel: input.allowMissingModel,
      allowRegistryFallbackModel: input.allowRegistryFallbackModel,
      missingMessage: formatMissingAgentModelPolicyMessage(this.agent.id),
    };
  }

  private async buildTools(descriptor: SessionDescriptor): Promise<ToolDefinition[]> {
    const channel = descriptor.delivery.kind === "channel"
      ? descriptor.delivery.channel
      : undefined;
    return this.runtime.buildRuntimeTools({
      bootstrap: this.bootstrap,
      channelBus: this.channelBus,
      agentId: this.agent.id,
      toolNames: this.toolPolicy.daemonToolNames,
      toolPolicy: this.sessionToolPolicy,
      ...(channel
        ? {
          actorId: `agent:${this.agent.id}`,
          activePublicationChannel: channel,
        }
        : {}),
    });
  }
}

function resolveResolverToolPolicy(
  runtime: AppRuntime,
  agent: ResolvedAgentConfig,
): AgentToolPolicy {
  if (typeof runtime.resolveAgentToolPolicy === "function") {
    return runtime.resolveAgentToolPolicy(agent.id);
  }
  return resolveAgentToolPolicy(agent);
}
