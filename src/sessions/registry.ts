import { existsSync } from "node:fs";
import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ChannelActivityHandle } from "../channels/egress.js";
import type { ChannelMessage } from "../channels/index.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import {
  formatChannelMessage,
  renderTurnContext,
  type TurnContext,
} from "../context/index.js";
import { openSession, type SessionBootstrap } from "./factory.js";
import type { SessionOpenPlan } from "./spec.js";
import { archiveSessionDir, restoreArchivedSessionDir } from "./storage.js";
import { runSessionTurn } from "./turn-output.js";
import type {
  GatewayLaneOutcome,
  GatewayLaneState,
} from "../gateway/runtime-state.js";

interface ManagedSession {
  session: AgentSession | null;
  plan?: SessionOpenPlan;
  channel: string;
  runChain: Promise<void>;
  queuedTurns: number;
  runningTurn?: {
    messageId: string;
    startedAt: number;
    controller: AbortController;
  };
  lastOutcome?: GatewayLaneState["lastOutcome"];
}

interface SessionTurn {
  message: ChannelMessage;
  promptBody: string;
  turnContextText?: string;
}

interface SessionResetResult {
  channel: string;
  sessionDir: string;
  hadSession: boolean;
  archivedTo?: string;
}

interface SessionRestoreResult {
  channel: string;
  sessionDir: string;
  restoredFrom: string;
  archivedPreviousTo?: string;
}

interface SessionThinkingLevelResult {
  channel: string;
  sessionDir: string;
  requestedLevel: ThinkingLevel;
  effectiveLevel: ThinkingLevel;
}

interface SessionStopResult {
  channel: string;
  stopped: boolean;
  messageId?: string;
}

interface SessionRegistryOpts {
  sessionFactory?: typeof openSession;
  planForChannel?: (channel: string) => SessionOpenPlan | Promise<SessionOpenPlan>;
  tools?: ToolDefinition[];
  turnContextForMessage?: (
    channel: string,
    message: ChannelMessage,
  ) => TurnContext | undefined | Promise<TurnContext | undefined>;
  markMessageHandled?: (
    channel: string,
    message: ChannelMessage,
  ) => void | Promise<void>;
  startActivity?: (
    channel: string,
  ) => ChannelActivityHandle | null | Promise<ChannelActivityHandle | null>;
  onLaneStateChange?: (state: GatewayLaneState) => void;
}

export class SessionRegistry {
  private sessions = new Map<string, ManagedSession>();
  private pending = new Map<string, Promise<AgentSession>>();
  private readonly bootstrap: SessionBootstrap;
  private readonly sessionFactory: typeof openSession;
  private readonly planForChannel: (channel: string) => SessionOpenPlan | Promise<SessionOpenPlan>;
  private readonly tools: ToolDefinition[];
  private readonly turnContextForMessage?: (
    channel: string,
    message: ChannelMessage,
  ) => TurnContext | undefined | Promise<TurnContext | undefined>;
  private readonly markMessageHandled?: (
    channel: string,
    message: ChannelMessage,
  ) => void | Promise<void>;
  private readonly startActivity?: (
    channel: string,
  ) => ChannelActivityHandle | null | Promise<ChannelActivityHandle | null>;
  private readonly onLaneStateChange?: (state: GatewayLaneState) => void;

  constructor(
    bootstrap: SessionBootstrap,
    opts?: SessionRegistryOpts,
  ) {
    this.bootstrap = bootstrap;
    this.sessionFactory = opts?.sessionFactory ?? openSession;
    this.planForChannel = opts?.planForChannel ?? ((channel) => ({
      descriptor: {
        kind: "gateway",
        channel,
        sessionDir: channel,
      },
      tools: opts?.tools,
    }));
    this.tools = opts?.tools ?? [];
    this.turnContextForMessage = opts?.turnContextForMessage;
    this.markMessageHandled = opts?.markMessageHandled;
    this.startActivity = opts?.startActivity;
    this.onLaneStateChange = opts?.onLaneStateChange;
  }

  getOrCreate(channel: string): ManagedSession {
    const existing = this.sessions.get(channel);
    if (existing) return existing;

    const managed = {
      session: null,
      channel,
      runChain: Promise.resolve(),
      queuedTurns: 0,
    };
    this.sessions.set(channel, managed);
    this.publishLaneState(managed);
    return managed;
  }

  private async ensureSession(
    managed: ManagedSession,
  ): Promise<AgentSession> {
    if (managed.session) return managed.session;

    const inflight = this.pending.get(managed.channel);
    if (inflight) {
      const session = await inflight;
      managed.session = session;
      return session;
    }

    const plan = await this.ensurePlan(managed);
    const creating = this.sessionFactory(
      this.bootstrap,
      planForExplicitRegistryTurns(plan),
    );
    this.pending.set(managed.channel, creating);

    try {
      const session = await creating;
      managed.session = session;
      return session;
    } finally {
      this.pending.delete(managed.channel);
    }
  }

  async dispatch(channel: string, message: ChannelMessage): Promise<void> {
    const managed = this.getOrCreate(channel);
    managed.queuedTurns += 1;
    this.publishLaneState(managed);
    managed.runChain = managed.runChain
      .catch((err) => {
        console.error(
          `[session:${managed.channel}] unexpected queue error:`,
          err,
        );
      })
      .then(() => this.runTurn(managed, channel, message));

    await managed.runChain;
  }

  stop(channel: string): SessionStopResult {
    const managed = this.getOrCreate(channel);
    if (!managed.runningTurn) {
      return {
        channel,
        stopped: false,
      };
    }

    const { messageId, controller } = managed.runningTurn;
    controller.abort(new Error("session turn stopped by user"));
    this.publishLaneState(managed);
    return {
      channel,
      stopped: true,
      messageId,
    };
  }

  getLaneState(channel: string): GatewayLaneState {
    return this.snapshotLane(this.getOrCreate(channel));
  }

  getLaneStates(): GatewayLaneState[] {
    return [...this.sessions.values()].map((managed) =>
      this.snapshotLane(managed)
    );
  }

  async reset(channel: string): Promise<SessionResetResult> {
    const managed = this.getOrCreate(channel);
    let result: SessionResetResult | null = null;

    managed.runChain = managed.runChain
      .catch((err) => {
        console.error(
          `[session:${managed.channel}] unexpected queue error before reset:`,
          err,
        );
      })
      .then(async () => {
        result = await this.resetManaged(managed);
      });

    await managed.runChain;

    if (!result) {
      throw new Error(`failed to reset session for ${channel}`);
    }
    return result;
  }

  async restore(
    channel: string,
    archiveName?: string,
  ): Promise<SessionRestoreResult> {
    const managed = this.getOrCreate(channel);
    let result: SessionRestoreResult | null = null;

    managed.runChain = managed.runChain
      .catch((err) => {
        console.error(
          `[session:${managed.channel}] unexpected queue error before restore:`,
          err,
        );
      })
      .then(async () => {
        result = await this.restoreManaged(managed, archiveName);
      });

    await managed.runChain;

    if (!result) {
      throw new Error(`failed to restore session for ${channel}`);
    }
    return result;
  }

  async setThinkingLevel(
    channel: string,
    level: ThinkingLevel,
  ): Promise<SessionThinkingLevelResult> {
    const managed = this.getOrCreate(channel);
    let result: SessionThinkingLevelResult | null = null;

    managed.runChain = managed.runChain
      .catch((err) => {
        console.error(
          `[session:${managed.channel}] unexpected queue error before thinking change:`,
          err,
        );
      })
      .then(async () => {
        result = await this.setThinkingLevelManaged(managed, level);
      });

    await managed.runChain;

    if (!result) {
      throw new Error(`failed to set thinking level for ${channel}`);
    }
    return result;
  }

  private async runTurn(
    managed: ManagedSession,
    channel: string,
    message: ChannelMessage,
  ): Promise<void> {
    managed.queuedTurns = Math.max(0, managed.queuedTurns - 1);
    const controller = new AbortController();
    managed.runningTurn = {
      messageId: message.id,
      startedAt: Date.now(),
      controller,
    };
    this.publishLaneState(managed);

    const turn = await this.prepareTurn(managed, channel, message);
    const session = await this.ensureSession(managed);
    let activity: ChannelActivityHandle | null = null;

    try {
      activity = await startActivity(this.startActivity, channel);
      await runSessionTurn(session, turn.promptBody, {
        signal: controller.signal,
        abortMessage: "session turn stopped by user",
        turnContextText: turn.turnContextText,
      });
      this.recordOutcome(managed, turn.message.id, "completed");
    } catch (err) {
      const aborted = controller.signal.aborted;
      this.recordOutcome(
        managed,
        turn.message.id,
        aborted ? "aborted" : "errored",
        formatError(err),
      );
      if (aborted) {
        this.disposeManagedSession(managed, "stop");
      } else {
        console.error(`[session:${managed.channel}] turn error:`, err);
      }
    } finally {
      await stopActivity(activity, managed.channel);
      if (managed.runningTurn?.messageId === turn.message.id) {
        managed.runningTurn = undefined;
      }
      this.publishLaneState(managed);
      await this.markMessageHandled?.(channel, turn.message);
    }
  }

  private recordOutcome(
    managed: ManagedSession,
    messageId: string,
    outcome: GatewayLaneOutcome,
    error?: string,
  ): void {
    managed.lastOutcome = {
      messageId,
      outcome,
      at: Date.now(),
      ...(error ? { error } : {}),
    };
  }

  private snapshotLane(managed: ManagedSession): GatewayLaneState {
    return {
      agentId: this.bootstrap.agentId,
      channel: managed.channel,
      queueDepth: managed.queuedTurns,
      ...(managed.runningTurn
        ? {
          currentTurn: {
            messageId: managed.runningTurn.messageId,
            startedAt: managed.runningTurn.startedAt,
          },
        }
        : {}),
      ...(managed.lastOutcome ? { lastOutcome: managed.lastOutcome } : {}),
    };
  }

  private publishLaneState(managed: ManagedSession): void {
    this.onLaneStateChange?.(this.snapshotLane(managed));
  }

  private async ensurePlan(managed: ManagedSession): Promise<SessionOpenPlan> {
    if (managed.plan) return managed.plan;

    managed.plan = normalizeRegistryPlan(
      await this.planForChannel(managed.channel),
      managed.channel,
      this.tools,
    );
    return managed.plan;
  }

  private async prepareTurn(
    managed: ManagedSession,
    channel: string,
    message: ChannelMessage,
  ): Promise<SessionTurn> {
    const promptBody = formatChannelMessage(channel, message);
    const plan = await this.ensurePlan(managed);
    const turnContextText = await this.prepareTurnContextText(
      plan,
      channel,
      message,
      promptBody,
    );

    return {
      message,
      promptBody,
      ...(turnContextText ? { turnContextText } : {}),
    };
  }

  private async prepareTurnContextText(
    plan: SessionOpenPlan,
    channel: string,
    message: ChannelMessage,
    promptBody: string,
  ): Promise<string | undefined> {
    const turnContext = this.turnContextForMessage
      ? await this.turnContextForMessage(channel, message)
      : undefined;
    const rendered = normalizeTurnContextText(
      turnContext ? renderTurnContext(turnContext) : undefined,
    );
    if (rendered) return rendered;
    if (promptBody.startsWith("/")) return undefined;
    return normalizeTurnContextText(
      await plan.prepareTurnContext?.(promptBody),
    );
  }

  private async resetManaged(
    managed: ManagedSession,
  ): Promise<SessionResetResult> {
    const plan = await this.ensurePlan(managed);
    const sessionDir = plan.descriptor.sessionDir;
    const hadSession = managed.session !== null || existsSync(sessionDir);

    if (managed.session) {
      this.disposeManagedSession(managed, "reset");
      managed.session = null;
    }
    managed.plan = undefined;

    return {
      channel: managed.channel,
      sessionDir,
      hadSession,
      archivedTo: archiveSessionDir(sessionDir),
    };
  }

  private async restoreManaged(
    managed: ManagedSession,
    archiveName?: string,
  ): Promise<SessionRestoreResult> {
    const plan = await this.ensurePlan(managed);
    const sessionDir = plan.descriptor.sessionDir;

    if (managed.session) {
      this.disposeManagedSession(managed, "restore");
      managed.session = null;
    }
    managed.plan = undefined;

    const restored = restoreArchivedSessionDir(sessionDir, archiveName);
    if (!restored) {
      throw new Error(
        archiveName
          ? `archive not found for ${managed.channel}: ${archiveName}`
          : `no archived sessions for ${managed.channel}`,
      );
    }

    return {
      channel: managed.channel,
      sessionDir,
      restoredFrom: restored.restoredFrom,
      archivedPreviousTo: restored.archivedPreviousTo,
    };
  }

  private async setThinkingLevelManaged(
    managed: ManagedSession,
    level: ThinkingLevel,
  ): Promise<SessionThinkingLevelResult> {
    const plan = await this.ensurePlan(managed);
    const session = await this.ensureSession(managed);
    session.setThinkingLevel(level);

    return {
      channel: managed.channel,
      sessionDir: plan.descriptor.sessionDir,
      requestedLevel: level,
      effectiveLevel: session.thinkingLevel as ThinkingLevel,
    };
  }

  async disposeAll(): Promise<void> {
    await Promise.allSettled(this.pending.values());
    await Promise.allSettled(
      Array.from(this.sessions.values(), (managed) => managed.runChain),
    );

    for (const managed of this.sessions.values()) {
      if (!managed.session) continue;
      this.disposeManagedSession(managed, "dispose");
    }

    this.sessions.clear();
  }

  private disposeManagedSession(
    managed: ManagedSession,
    reason: "reset" | "restore" | "stop" | "dispose",
  ): void {
    if (!managed.session) return;
    try {
      managed.session.dispose();
    } catch (err) {
      console.error(
        `[session:${managed.channel}] dispose error during ${reason}:`,
        err,
      );
    }
    managed.session = null;
  }
}

function normalizeRegistryPlan(
  plan: SessionOpenPlan,
  channel: string,
  fallbackTools: ToolDefinition[],
): SessionOpenPlan {
  return {
    ...plan,
    tools: plan.tools ?? fallbackTools,
    descriptor: {
      ...plan.descriptor,
      channel: plan.descriptor.channel ?? channel,
    },
  };
}

function planForExplicitRegistryTurns(plan: SessionOpenPlan): SessionOpenPlan {
  const openPlan: SessionOpenPlan = { ...plan };
  delete openPlan.prepareTurnContext;
  return openPlan;
}

function normalizeTurnContextText(
  text: string | undefined,
): string | undefined {
  const trimmed = text?.trim();
  return trimmed ? trimmed : undefined;
}

function formatError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return String(err);
}

async function startActivity(
  start:
    | ((channel: string) =>
      ChannelActivityHandle | null | Promise<ChannelActivityHandle | null>)
    | undefined,
  channel: string,
): Promise<ChannelActivityHandle | null> {
  if (!start) return null;
  try {
    return await start(channel);
  } catch (err) {
    console.error(`[session:${channel}] activity start error:`, err);
    return null;
  }
}

async function stopActivity(
  activity: ChannelActivityHandle | null,
  channel: string,
): Promise<void> {
  if (!activity) return;
  try {
    await activity.stop();
  } catch (err) {
    console.error(`[session:${channel}] activity stop error:`, err);
  }
}
