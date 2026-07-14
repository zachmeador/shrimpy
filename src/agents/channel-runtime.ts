import type { AppRuntime } from "../app/runtime.js";
import { type ChannelMessage } from "../channels/index.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  buildTurnContext,
  markChannelSeen,
} from "../context/index.js";
import type { ResolvedAgentConfig } from "../config/agents.js";
import type { ModelRef } from "../config/model.js";
import type { ThinkingLevel } from "../thinking.js";
import {
  evaluateAgentChannelPolicy,
} from "./channel-policy.js";
import {
  SessionPool,
  type SessionBootstrap,
  SessionResolver,
  createChannelSessionKey,
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
  private readonly pool: SessionPool;
  private readonly runtime: AppRuntime;
  private readonly bootstrap: SessionBootstrap;
  private readonly onRuntimeGuardTrip?: AgentChannelRuntimeOpts["onRuntimeGuardTrip"];

  constructor(opts: AgentChannelRuntimeOpts) {
    this.agentId = opts.agentId;
    this.runtime = opts.runtime;
    this.bootstrap = opts.bootstrap;
    this.agent = opts.runtime.getAgent(opts.agentId);
    this.channelBus = opts.channelBus;
    this.onRuntimeGuardTrip = opts.onRuntimeGuardTrip;
    const resolver = new SessionResolver({
      runtime: opts.runtime,
      bootstrap: opts.bootstrap,
      channelBus: opts.channelBus,
      agentId: this.agent.id,
    });

    this.pool = new SessionPool(opts.bootstrap, {
      planForChannel: (channel) => resolver.resolve({
        key: createChannelSessionKey({ agentId: this.agent.id, channel }),
        purpose: "channel",
        delivery: { kind: "channel", channel },
        persistent: true,
        cwd: opts.runtime.getAgentCwd(this.agent.id),
      }),
      turnContextForMessage: (channel, message) => buildTurnContext({
        runtime: opts.runtime,
        descriptor: resolver.descriptor({
          key: createChannelSessionKey({ agentId: this.agent.id, channel }),
          purpose: "channel",
          delivery: { kind: "channel", channel },
          persistent: true,
          cwd: opts.runtime.getAgentCwd(this.agent.id),
        }),
        currentMessage: message,
      }),
      markMessageHandled: (channel, message) =>
        Promise.resolve(markChannelSeen(opts.runtime, this.agent.id, channel, message.id))
          .then(() => opts.markMessageHandled?.(this.agent.id, channel, message)),
      startActivity: (channel) =>
        this.channelBus.startActivity({ channel, kind: "typing" }),
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
    await this.pool.dispatch(channel, message);
  }

  async reset(channel: string) {
    return this.pool.reset(channel);
  }

  async restore(channel: string, archiveName?: string) {
    return this.pool.restore(channel, archiveName);
  }

  async setThinkingLevel(
    channel: string,
    level: NonNullable<typeof this.agent.thinking>,
  ) {
    return this.pool.setThinkingLevel(channel, level);
  }

  async setSettings(
    channel: string,
    input: {
      thinking?: ThinkingLevel;
      model?: ModelRef;
      modelPolicy?: string;
    },
  ) {
    const model = input.model || input.modelPolicy
      ? this.runtime.resolveModel(
        this.bootstrap,
        input.model?.provider,
        input.model?.id,
        input.modelPolicy ? undefined : this.agent.modelPolicy,
        input.modelPolicy ? { modelPolicy: input.modelPolicy } : undefined,
      )
      : undefined;
    return this.pool.setSettings(channel, {
      thinking: input.thinking,
      model,
    });
  }

  stop(channel: string) {
    return this.pool.stop(channel);
  }

  getLaneStates(): GatewayLaneState[] {
    return this.pool.getLaneStates();
  }

  async dispose(): Promise<void> {
    await this.pool.disposeAll();
  }

  private runtimeGuardTrip(
    channel: string,
    message: ChannelMessage,
    reason: string,
  ): void {
    this.pool.getLaneState(channel);
    this.onRuntimeGuardTrip?.({
      agentId: this.agent.id,
      channel,
      message,
      reason,
    });
  }

}
