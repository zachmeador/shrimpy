import type { AppRuntime } from "../app/runtime.js";
import { type ChannelMessage } from "../channels/index.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  buildTurnContext,
  markChannelSeen,
} from "../context/index.js";
import type { ResolvedAgentConfig } from "../config/agents.js";
import { resolveModelVariantInference } from "../inference/params.js";
import {
  createSessionToolPolicy,
  resolveAgentToolPolicy,
} from "../tools/policy.js";
import {
  evaluateAgentChannelPolicy,
} from "./channel-policy.js";
import {
  createGatewaySessionDescriptor,
  formatMissingAgentModelPolicyMessage,
  resolveModelDetailed,
  SessionRegistry,
  type SessionBootstrap,
} from "../sessions/index.js";
import type { GatewayLaneState } from "../gateway/runtime-state.js";

interface AgentChannelRuntimeOpts {
  runtime: AppRuntime;
  bootstrap: SessionBootstrap;
  channelBus: ChannelBus;
  agentId: string;
  markMessageHandled?: (
    agentId: string,
    channel: string,
    message: ChannelMessage,
  ) => void | Promise<void>;
  onLaneStateChange?: (state: GatewayLaneState) => void;
  onRuntimeGuardTrip?: (input: {
    agentId: string;
    channel: string;
    message: ChannelMessage;
    reason: string;
  }) => void;
}

export class AgentChannelRuntime {
  readonly agentId: string;
  private readonly agent: ResolvedAgentConfig;
  private readonly channelBus: ChannelBus;
  private readonly registry: SessionRegistry;
  private readonly onRuntimeGuardTrip?: AgentChannelRuntimeOpts["onRuntimeGuardTrip"];

  constructor(opts: AgentChannelRuntimeOpts) {
    this.agentId = opts.agentId;
    this.agent = opts.runtime.getAgent(opts.agentId);
    this.channelBus = opts.channelBus;
    this.onRuntimeGuardTrip = opts.onRuntimeGuardTrip;
    const toolPolicy = resolveAgentToolPolicy(this.agent);
    const sessionToolPolicy = createSessionToolPolicy(toolPolicy);
    const modelResolution = resolveModelDetailed(
      opts.bootstrap,
      undefined,
      undefined,
      this.agent.modelPolicy,
      {
        missingMessage: formatMissingAgentModelPolicyMessage(this.agent.id),
      },
    );
    const model = modelResolution.model;
    const inference = resolveModelVariantInference({
      modelsPath: opts.bootstrap.modelsPath,
      model,
    });

    this.registry = new SessionRegistry(opts.bootstrap, {
      planForChannel: async (channel) => {
        const tools = await opts.runtime.buildRuntimeTools({
          bootstrap: opts.bootstrap,
          channelBus: opts.channelBus,
          toolNames: toolPolicy.daemonToolNames,
          toolPolicy: sessionToolPolicy,
          agentId: this.agent.id,
          actorId: `agent:${this.agent.id}`,
          activePublicationChannel: channel,
        });

        return {
          descriptor: createGatewaySessionDescriptor({
            workspacePath: opts.bootstrap.agentRootPath,
            agentId: this.agent.id,
            channel,
          }),
          model,
          modelResolution,
          inference,
          defaultThinking: this.agent.thinking,
          tools,
          toolPolicy: sessionToolPolicy,
        };
      },
      turnContextForMessage: (channel, message) =>
        buildTurnContext({
          runtime: opts.runtime,
          descriptor: createGatewaySessionDescriptor({
            workspacePath: opts.bootstrap.agentRootPath,
            agentId: this.agent.id,
            channel,
          }),
          currentMessage: message,
        }),
      markMessageHandled: (channel, message) =>
        Promise.resolve(markChannelSeen(opts.runtime, this.agent.id, channel, message.id))
          .then(() => opts.markMessageHandled?.(this.agent.id, channel, message)),
      onLaneStateChange: opts.onLaneStateChange,
    });
  }

  shouldHandleMessage(channel: string, message: ChannelMessage): boolean {
    const decision = evaluateAgentChannelPolicy(this.agent, channel, message, {
      visible: true,
    });
    if (decision.action === "ignore" && decision.runtimeGuard) {
      this.runtimeGuardTrip(channel, message, decision.runtimeGuard);
    }
    return decision.action === "wake";
  }

  async handleMessage(channel: string, message: ChannelMessage): Promise<void> {
    if (!this.shouldHandleMessage(channel, message)) return;
    await this.registry.dispatch(channel, message);
  }

  async reset(channel: string) {
    return this.registry.reset(channel);
  }

  async restore(channel: string, archiveName?: string) {
    return this.registry.restore(channel, archiveName);
  }

  async setThinkingLevel(
    channel: string,
    level: NonNullable<typeof this.agent.thinking>,
  ) {
    return this.registry.setThinkingLevel(channel, level);
  }

  stop(channel: string) {
    return this.registry.stop(channel);
  }

  getLaneStates(): GatewayLaneState[] {
    return this.registry.getLaneStates();
  }

  async dispose(): Promise<void> {
    await this.registry.disposeAll();
  }

  private runtimeGuardTrip(
    channel: string,
    message: ChannelMessage,
    reason: string,
  ): void {
    this.registry.getLaneState(channel);
    this.onRuntimeGuardTrip?.({
      agentId: this.agent.id,
      channel,
      message,
      reason,
    });
  }

}
