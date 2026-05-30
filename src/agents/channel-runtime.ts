import type { AppRuntime } from "../app/runtime.js";
import { type ChannelMessage } from "../channels/index.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  buildTurnContext,
  markChannelSeen,
} from "../context/index.js";
import type { ResolvedAgentConfig } from "../config/agents.js";
import { mergeModelSelection } from "../config/index.js";
import { resolveModelVariantInference } from "../inference/params.js";
import {
  createSessionToolPolicy,
  resolveAgentToolPolicy,
} from "../tools/policy.js";
import {
  createAgentChannelPolicy,
  type AgentChannelPolicy,
} from "./channel-policy.js";
import {
  createGatewaySessionDescriptor,
  resolveModel,
  SessionRegistry,
  type SessionBootstrap,
} from "../sessions/index.js";

interface AgentChannelRuntimeOpts {
  runtime: AppRuntime;
  bootstrap: SessionBootstrap;
  channelBus: ChannelBus;
  agentId: string;
}

export class AgentChannelRuntime {
  readonly agentId: string;
  private readonly agent: ResolvedAgentConfig;
  private readonly channelBus: ChannelBus;
  private readonly policy: AgentChannelPolicy;
  private readonly registry: SessionRegistry;

  constructor(opts: AgentChannelRuntimeOpts) {
    this.agentId = opts.agentId;
    this.agent = opts.runtime.getAgent(opts.agentId);
    this.channelBus = opts.channelBus;
    const toolPolicy = resolveAgentToolPolicy(this.agent);
    const sessionToolPolicy = createSessionToolPolicy(toolPolicy);
    this.policy = createAgentChannelPolicy({
      agent: this.agent,
    });
    const model = resolveModel(
      opts.bootstrap,
      undefined,
      undefined,
      mergeModelSelection(opts.runtime.resolved.model, this.agent.model),
    );
    const inference = resolveModelVariantInference({
      modelsPath: opts.bootstrap.modelsPath,
      model,
    });

    this.registry = new SessionRegistry(opts.bootstrap, {
      planForChannel: (channel) => {
        const tools = opts.runtime.buildRuntimeTools({
          bootstrap: opts.bootstrap,
          channelBus: opts.channelBus,
          toolNames: toolPolicy.daemonToolNames,
          toolPolicy: sessionToolPolicy,
          agentId: this.agent.id,
          actorId: `agent:${this.agent.id}`,
          activeChannel: channel,
        });

        return {
          descriptor: createGatewaySessionDescriptor({
            workspacePath: opts.bootstrap.agentRootPath,
            agentId: this.agent.id,
            channel,
          }),
          model,
          inference,
          defaultThinking: this.agent.thinking,
          tools,
          toolPolicy: sessionToolPolicy,
        };
      },
      turnBriefingForMessage: (channel, message) =>
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
        markChannelSeen(opts.runtime, this.agent.id, channel, message.id),
    });
  }

  shouldHandleMessage(channel: string, message: ChannelMessage): boolean {
    return this.policy.shouldHandleMessage(channel, message);
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

  async dispose(): Promise<void> {
    await this.registry.disposeAll();
  }
}
