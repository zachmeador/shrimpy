import type { AppRuntime } from "../app/runtime.js";
import { type ChannelMessage } from "../channels/index.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  buildTurnContext,
  markChannelSeen,
} from "../context/index.js";
import type { ResolvedAgentConfig } from "../config/agents.js";
import {
  evaluateAgentChannelPolicy,
} from "./channel-policy.js";
import {
  SessionRegistry,
  type SessionBootstrap,
  SessionPlanner,
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
    const planner = new SessionPlanner({
      runtime: opts.runtime,
      bootstrap: opts.bootstrap,
      channelBus: opts.channelBus,
      agentId: this.agent.id,
    });

    this.registry = new SessionRegistry(opts.bootstrap, {
      planForChannel: (channel) => planner.planChannel(channel),
      turnContextForMessage: (channel, message) =>
        buildTurnContext({
          runtime: opts.runtime,
          descriptor: planner.createGatewayDescriptor(channel),
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
