import { AgentChannelRuntime } from "../agents/channel-runtime.js";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import { loadCursors, saveCursors, type ChannelCursor, type ChannelWatcher } from "../channels/store.js";
import type { ChannelMembershipStore } from "../channels/membership.js";
import type { ChannelMessage } from "../channels/protocol.js";
import { classifyChannelMessage } from "../channels/inspection.js";
import {
  getSessionControlTargetAgentId,
  SessionControlRuntime,
  type DispatchSource,
} from "./session-control-runtime.js";
import type { SessionBootstrap } from "../sessions/bootstrap.js";
import {
  GatewayRuntimeStateStore,
  gatewayRuntimeStatePath,
} from "./runtime-state.js";

interface ChannelDeliveryLoopOpts {
  runtime: AppRuntime;
  bootstraps: Map<string, SessionBootstrap>;
  channelBus: ChannelBus;
}

export function shouldDispatchBacklogMessage(message: ChannelMessage): boolean {
  return classifyChannelMessage(message) !== "watch";
}

export class ChannelDeliveryLoop {
  private readonly runtime: AppRuntime;
  private readonly channelBus: ChannelBus;
  private readonly memberships: ChannelMembershipStore;
  private readonly agentRuntimes: Map<string, AgentChannelRuntime>;
  private readonly controlRuntime: SessionControlRuntime;
  private readonly stateStore: GatewayRuntimeStateStore;
  private readonly activeDispatches = new Set<Promise<void>>();
  private cursors: Record<string, ChannelCursor> = {};
  private watcher: ChannelWatcher | null = null;

  constructor(opts: ChannelDeliveryLoopOpts) {
    this.runtime = opts.runtime;
    this.channelBus = opts.channelBus;
    this.memberships = this.runtime.createChannelMembershipStore();
    this.stateStore = new GatewayRuntimeStateStore(
      gatewayRuntimeStatePath(this.runtime.paths),
    );

    this.agentRuntimes = new Map();
    for (const agent of this.runtime.resolved.agents) {
      const bootstrap = opts.bootstraps.get(agent.id);
      if (!bootstrap) {
        throw new Error(`[delivery] missing bootstrap for agent ${agent.id}`);
      }
      this.agentRuntimes.set(
        agent.id,
        new AgentChannelRuntime({
          runtime: this.runtime,
          bootstrap,
          channelBus: this.channelBus,
          agentId: agent.id,
          markMessageHandled: (agentId, channel, message) =>
            this.stateStore.markHandled(agentId, channel, message.id),
          onLaneStateChange: (state) =>
            this.stateStore.recordLane(state),
          onRuntimeGuardTrip: ({ agentId, channel, message, reason }) =>
            this.stateStore.recordLoopGuardTrip({
              agentId,
              channel,
              messageId: message.id,
              reason,
            }),
        }),
      );
    }
    this.controlRuntime = new SessionControlRuntime(
      this.channelBus,
      this.agentRuntimes,
    );
  }

  async drainBacklog(): Promise<void> {
    const cursors = loadCursors(this.runtime.paths.cursorsPath);
    const backlog: Array<{ channel: string; message: ChannelMessage }> = [];

    const updatedCursors = this.channelBus.drainBacklog(
      cursors,
      (channel, messages) => {
        for (const msg of messages) {
          if (!shouldDispatchBacklogMessage(msg)) continue;
          backlog.push({ channel, message: msg });
        }
      },
    );

    for (const entry of backlog) {
      await this.enqueueMessage(entry.channel, entry.message, "backlog");
    }

    saveCursors(this.runtime.paths.cursorsPath, updatedCursors);
    this.cursors = updatedCursors;
  }

  start(): void {
    if (this.watcher) throw new Error("[delivery] already started");
    this.watcher = this.channelBus.watch(
      (channel, messages) => {
        for (const msg of messages) {
          void this.enqueueMessage(channel, msg, "live");
        }
      },
      this.cursors,
    );
  }

  async stop(): Promise<void> {
    this.watcher?.stop();
    await Promise.allSettled(this.activeDispatches);
    await Promise.allSettled(
      Array.from(this.agentRuntimes.values(), (agentRuntime) => agentRuntime.dispose()),
    );
    if (this.watcher) {
      saveCursors(this.runtime.paths.cursorsPath, this.watcher.getCursors());
    }
  }

  private enqueueMessage(
    channel: string,
    message: ChannelMessage,
    source: DispatchSource,
  ): Promise<void> {
    const dispatch = this.dispatchMessage(channel, message, source)
      .catch((err: unknown) => {
        console.error(`[delivery] dispatch error for ${channel}:`, err);
      })
      .finally(() => {
        this.activeDispatches.delete(dispatch);
        if (source === "live") {
          this.saveLiveCursorsIfIdle();
        }
      });
    this.activeDispatches.add(dispatch);
    return dispatch;
  }

  private saveLiveCursorsIfIdle(): void {
    if (!this.watcher || this.activeDispatches.size > 0) return;
    saveCursors(this.runtime.paths.cursorsPath, this.watcher.getCursors());
  }

  private async dispatchMessage(
    channel: string,
    message: ChannelMessage,
    source: DispatchSource,
  ): Promise<void> {
    const controlTargetAgentId = getSessionControlTargetAgentId(message);
    if (
      controlTargetAgentId &&
      this.stateStore.hasHandled(controlTargetAgentId, channel, message.id)
    ) {
      return;
    }
    if (await this.controlRuntime.handleMessage(channel, message, source)) {
      if (controlTargetAgentId) {
        this.stateStore.markHandled(controlTargetAgentId, channel, message.id);
      }
      return;
    }

    const agentIds = new Set(this.memberships.listAgentIds(channel));

    await Promise.all([...agentIds].map(async (agentId) => {
      if (this.stateStore.hasHandled(agentId, channel, message.id)) return;
      const agentRuntime = this.agentRuntimes.get(agentId);
      if (!agentRuntime) {
        console.error(`[delivery] no agent runtime for agent ${agentId}`);
        return;
      }
      try {
        await agentRuntime.handleMessage(channel, message);
      } catch (err) {
        console.error(
          `[delivery] ${source} dispatch error for ${channel} (agent ${agentId}):`,
          err,
        );
      }
    }));
  }
}
