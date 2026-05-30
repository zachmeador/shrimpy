import { existsSync } from "node:fs";
import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ChannelMessage } from "../channels/index.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import {
  composePromptWithBriefing,
  formatChannelMessage,
  renderTurnContext,
  type TurnContext,
} from "../context/index.js";
import { openSession, type SessionBootstrap } from "./factory.js";
import type { SessionOpenPlan } from "./spec.js";
import { archiveSessionDir, restoreArchivedSessionDir } from "./storage.js";
import { runSessionTurn } from "./turn-output.js";

interface ManagedSession {
  session: AgentSession | null;
  channel: string;
  runChain: Promise<void>;
}

export interface SessionResetResult {
  channel: string;
  sessionDir: string;
  hadSession: boolean;
  archivedTo?: string;
}

export interface SessionRestoreResult {
  channel: string;
  sessionDir: string;
  restoredFrom: string;
  archivedPreviousTo?: string;
}

export interface SessionThinkingLevelResult {
  channel: string;
  sessionDir: string;
  requestedLevel: ThinkingLevel;
  effectiveLevel: ThinkingLevel;
}

interface SessionRegistryOpts {
  sessionFactory?: typeof openSession;
  planForChannel?: (channel: string) => SessionOpenPlan;
  tools?: ToolDefinition[];
  turnBriefingForMessage?: (
    channel: string,
    message: ChannelMessage,
  ) => TurnContext | Promise<TurnContext>;
  markMessageHandled?: (
    channel: string,
    message: ChannelMessage,
  ) => void | Promise<void>;
}

export class SessionRegistry {
  private sessions = new Map<string, ManagedSession>();
  private pending = new Map<string, Promise<AgentSession>>();
  private readonly bootstrap: SessionBootstrap;
  private readonly sessionFactory: typeof openSession;
  private readonly planForChannel: (channel: string) => SessionOpenPlan;
  private readonly tools: ToolDefinition[];
  private readonly turnBriefingForMessage?: (
    channel: string,
    message: ChannelMessage,
  ) => TurnContext | Promise<TurnContext>;
  private readonly markMessageHandled?: (
    channel: string,
    message: ChannelMessage,
  ) => void | Promise<void>;

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
    this.turnBriefingForMessage = opts?.turnBriefingForMessage;
    this.markMessageHandled = opts?.markMessageHandled;
  }

  getOrCreate(channel: string): ManagedSession {
    const existing = this.sessions.get(channel);
    if (existing) return existing;

    const managed = {
      session: null,
      channel,
      runChain: Promise.resolve(),
    };
    this.sessions.set(channel, managed);
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

    const plan = this.planForChannel(managed.channel);
    const creating = this.sessionFactory(this.bootstrap, {
      ...plan,
      tools: plan.tools ?? this.tools,
      descriptor: {
        ...plan.descriptor,
        channel: plan.descriptor.channel ?? managed.channel,
      },
    });
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
    const promptBody = formatChannelMessage(channel, message);
    const briefing = this.turnBriefingForMessage
      ? await this.turnBriefingForMessage(channel, message)
      : undefined;
    const prompt = composePromptWithBriefing(
      promptBody,
      briefing ? renderTurnContext(briefing) : undefined,
    );
    const session = await this.ensureSession(managed);

    try {
      await runSessionTurn(session, prompt);
    } catch (err) {
      console.error(`[session:${managed.channel}] turn error:`, err);
    } finally {
      await this.markMessageHandled?.(channel, message);
    }
  }

  private async resetManaged(
    managed: ManagedSession,
  ): Promise<SessionResetResult> {
    const plan = this.planForChannel(managed.channel);
    const sessionDir = plan.descriptor.sessionDir;
    const hadSession = managed.session !== null || existsSync(sessionDir);

    if (managed.session) {
      try {
        managed.session.dispose();
      } catch (err) {
        console.error(
          `[session:${managed.channel}] dispose error during reset:`,
          err,
        );
      }
      managed.session = null;
    }

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
    const plan = this.planForChannel(managed.channel);
    const sessionDir = plan.descriptor.sessionDir;

    if (managed.session) {
      try {
        managed.session.dispose();
      } catch (err) {
        console.error(
          `[session:${managed.channel}] dispose error during restore:`,
          err,
        );
      }
      managed.session = null;
    }

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
    const plan = this.planForChannel(managed.channel);
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
      try {
        managed.session.dispose();
      } catch (err) {
        console.error(
          `[session:${managed.channel}] dispose error:`,
          err,
        );
      }
    }

    this.sessions.clear();
  }
}
