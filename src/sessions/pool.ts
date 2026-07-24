import { existsSync } from "node:fs";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ChannelActivityHandle } from "../channels/egress.js";
import type { ChannelMessage } from "../channels/protocol.js";
import { formatChannelMessage } from "../context/turn/channel-message.js";
import { renderTurnContext } from "../context/turn/render.js";
import type { TurnContext } from "../context/turn/types.js";
import type {
  GatewayLaneOutcome,
  GatewayLaneState,
} from "../gateway/runtime-state.js";
import type { SessionBootstrap } from "./bootstrap.js";
import { disposeSession, openSession } from "./open.js";
import type { SessionOpenPlan } from "./spec.js";
import { durableSessionDir } from "./spec.js";
import { archiveActiveSession, restoreArchivedSession } from "./transcript-store.js";
import type { ThinkingLevel } from "../config/thinking.js";
import { toModelRef } from "../config/model.js";
import { runSessionTurn } from "./turn-output.js";

interface SessionLane {
  channel: string;
  session: AgentSession | null;
  plan?: SessionOpenPlan;
  chain: Promise<void>;
  queued: number;
  running?: {
    messageId: string;
    startedAt: number;
    controller: AbortController;
  };
  lastOutcome?: GatewayLaneState["lastOutcome"];
}

interface SessionPoolOptions {
  sessionFactory?: typeof openSession;
  planForChannel(channel: string): SessionOpenPlan | Promise<SessionOpenPlan>;
  tools?: ToolDefinition[];
  turnContextForMessage?(
    channel: string,
    message: ChannelMessage,
  ): TurnContext | undefined | Promise<TurnContext | undefined>;
  markMessageHandled?(
    channel: string,
    message: ChannelMessage,
  ): void | Promise<void>;
  startActivity?(
    channel: string,
  ): ChannelActivityHandle | null | Promise<ChannelActivityHandle | null>;
  onLaneStateChange?(state: GatewayLaneState): void;
}

export class SessionPool {
  private readonly lanes = new Map<string, SessionLane>();

  constructor(
    private readonly bootstrap: SessionBootstrap,
    private readonly options: SessionPoolOptions,
  ) {
    if (!options.planForChannel) throw new Error("SessionPool requires planForChannel");
  }

  async dispatch(channel: string, message: ChannelMessage): Promise<void> {
    const lane = this.lane(channel);
    lane.queued += 1;
    this.publish(lane);
    await this.enqueue(lane, "turn", () => this.runTurn(lane, message));
  }

  stop(channel: string) {
    const lane = this.lane(channel);
    if (!lane.running) return { channel, stopped: false };
    const { messageId, controller } = lane.running;
    controller.abort(new Error("session turn stopped by user"));
    this.publish(lane);
    return { channel, stopped: true, messageId };
  }

  getLaneState(channel: string): GatewayLaneState {
    return this.snapshot(this.lane(channel));
  }

  getLaneStates(): GatewayLaneState[] {
    return [...this.lanes.values()].map((lane) => this.snapshot(lane));
  }

  async reset(channel: string) {
    const lane = this.lane(channel);
    return this.enqueue(lane, "reset", async () => {
      const sessionDir = durableSessionDir((await this.plan(lane)).descriptor);
      const hadSession = lane.session !== null || existsSync(sessionDir);
      this.drop(lane, "reset");
      lane.plan = undefined;
      return {
        channel,
        sessionDir,
        hadSession,
        archivedTo: archiveActiveSession(sessionDir),
      };
    });
  }

  async restore(channel: string, archiveName?: string) {
    const lane = this.lane(channel);
    return this.enqueue(lane, "restore", async () => {
      const sessionDir = durableSessionDir((await this.plan(lane)).descriptor);
      this.drop(lane, "restore");
      lane.plan = undefined;
      const restored = restoreArchivedSession(sessionDir, archiveName);
      if (!restored) {
        throw new Error(archiveName
          ? `archive not found for ${channel}: ${archiveName}`
          : `no archived sessions for ${channel}`);
      }
      return { channel, sessionDir, ...restored };
    });
  }

  async setThinkingLevel(channel: string, level: ThinkingLevel) {
    const lane = this.lane(channel);
    return this.enqueue(lane, "set thinking level", async () => {
      const plan = await this.plan(lane);
      const session = await this.session(lane);
      session.setThinkingLevel(level);
      return {
        channel,
        sessionDir: durableSessionDir(plan.descriptor),
        requestedLevel: level,
        effectiveLevel: session.thinkingLevel as ThinkingLevel,
      };
    });
  }

  async setSettings(
    channel: string,
    input: { thinking?: ThinkingLevel; model?: Model<Api> },
  ) {
    const lane = this.lane(channel);
    return this.enqueue(lane, "set session settings", async () => {
      const plan = await this.plan(lane);
      const session = await this.session(lane);
      if (input.model) await session.setModel(input.model);
      if (input.thinking) session.setThinkingLevel(input.thinking);
      return {
        channel,
        sessionDir: durableSessionDir(plan.descriptor),
        ...(input.thinking
          ? {
            requestedThinking: input.thinking,
            effectiveThinking: session.thinkingLevel as ThinkingLevel,
          }
          : {}),
        ...(input.model
          ? {
            requestedModel: toModelRef(input.model),
            effectiveModel: toModelRef(session.model),
          }
          : {}),
      };
    });
  }

  async disposeAll(): Promise<void> {
    await Promise.allSettled([...this.lanes.values()].map((lane) => lane.chain));
    for (const lane of this.lanes.values()) this.drop(lane, "dispose");
    this.lanes.clear();
  }

  private lane(channel: string): SessionLane {
    const existing = this.lanes.get(channel);
    if (existing) return existing;
    const lane: SessionLane = {
      channel,
      session: null,
      chain: Promise.resolve(),
      queued: 0,
    };
    this.lanes.set(channel, lane);
    this.publish(lane);
    return lane;
  }

  private async plan(lane: SessionLane): Promise<SessionOpenPlan> {
    if (!lane.plan) {
      const plan = await this.options.planForChannel(lane.channel);
      lane.plan = { ...plan, tools: plan.tools ?? this.options.tools ?? [] };
    }
    return lane.plan;
  }

  private async session(lane: SessionLane): Promise<AgentSession> {
    if (!lane.session) {
      const plan = { ...await this.plan(lane) };
      delete plan.prepareTurnContext;
      lane.session = await (this.options.sessionFactory ?? openSession)(
        this.bootstrap,
        plan,
      );
    }
    return lane.session;
  }

  private async enqueue<T>(
    lane: SessionLane,
    operation: string,
    run: () => Promise<T>,
  ): Promise<T> {
    let result: { value: T } | undefined;
    lane.chain = lane.chain
      .catch((err) => {
        console.error(`[session:${lane.channel}] queue error before ${operation}:`, err);
      })
      .then(async () => {
        result = { value: await run() };
      });
    await lane.chain;
    if (!result) throw new Error(`failed to ${operation} for ${lane.channel}`);
    return result.value;
  }

  private async runTurn(lane: SessionLane, message: ChannelMessage): Promise<void> {
    lane.queued = Math.max(0, lane.queued - 1);
    const controller = new AbortController();
    lane.running = { messageId: message.id, startedAt: Date.now(), controller };
    this.publish(lane);

    let activity: ChannelActivityHandle | null = null;
    try {
      const prompt = formatChannelMessage(lane.channel, message);
      const turnContextText = await this.turnContext(lane, message, prompt);
      const session = await this.session(lane);
      activity = await this.startActivity(lane.channel);
      await runSessionTurn(session, prompt, {
        signal: controller.signal,
        abortMessage: "session turn stopped by user",
        turnContextText,
        channelDelivery: true,
      });
      this.record(lane, message.id, "completed");
    } catch (err) {
      const aborted = controller.signal.aborted;
      this.record(lane, message.id, aborted ? "aborted" : "errored", formatError(err));
      if (aborted) this.drop(lane, "stop");
      else console.error(`[session:${lane.channel}] turn error:`, err);
    } finally {
      await this.stopActivity(activity, lane.channel);
      if (lane.running?.messageId === message.id) lane.running = undefined;
      this.publish(lane);
      await this.options.markMessageHandled?.(lane.channel, message);
    }
  }

  private async turnContext(
    lane: SessionLane,
    message: ChannelMessage,
    prompt: string,
  ): Promise<string | undefined> {
    const context = await this.options.turnContextForMessage?.(lane.channel, message);
    const routed = normalize(context ? renderTurnContext(context) : undefined);
    if (routed || prompt.startsWith("/")) return routed;
    return normalize(await (await this.plan(lane)).prepareTurnContext?.(prompt));
  }

  private record(
    lane: SessionLane,
    messageId: string,
    outcome: GatewayLaneOutcome,
    error?: string,
  ): void {
    lane.lastOutcome = {
      messageId,
      outcome,
      at: Date.now(),
      ...(error ? { error } : {}),
    };
  }

  private snapshot(lane: SessionLane): GatewayLaneState {
    return {
      agentId: this.bootstrap.agentId,
      channel: lane.channel,
      queueDepth: lane.queued,
      ...(lane.running
        ? { currentTurn: {
          messageId: lane.running.messageId,
          startedAt: lane.running.startedAt,
        } }
        : {}),
      ...(lane.lastOutcome ? { lastOutcome: lane.lastOutcome } : {}),
    };
  }

  private publish(lane: SessionLane): void {
    this.options.onLaneStateChange?.(this.snapshot(lane));
  }

  private drop(lane: SessionLane, reason: string): void {
    if (!lane.session) return;
    try {
      disposeSession(lane.session);
    } catch (err) {
      console.error(`[session:${lane.channel}] dispose error during ${reason}:`, err);
    }
    lane.session = null;
  }

  private async startActivity(channel: string): Promise<ChannelActivityHandle | null> {
    try {
      return await this.options.startActivity?.(channel) ?? null;
    } catch (err) {
      console.error(`[session:${channel}] activity start error:`, err);
      return null;
    }
  }

  private async stopActivity(
    activity: ChannelActivityHandle | null,
    channel: string,
  ): Promise<void> {
    try {
      await activity?.stop();
    } catch (err) {
      console.error(`[session:${channel}] activity stop error:`, err);
    }
  }
}

function normalize(text: string | undefined): string | undefined {
  return text?.trim() || undefined;
}

function formatError(err: unknown): string {
  return err instanceof Error && err.message.trim() ? err.message.trim() : String(err);
}
