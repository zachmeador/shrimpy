import type { AgentChannelRuntime } from "../agents/channel-runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  isThinkingLevel,
  type ThinkingLevel,
} from "../inference/thinking.js";
import {
  readSessionResetContent,
  readSessionRestoreContent,
  readSessionThinkingLevelContent,
  type ChannelMessage,
} from "../channels/index.js";

export type DispatchSource = "backlog" | "live";

export function isSessionControlMessage(message: ChannelMessage): boolean {
  return readSessionResetContent(message.content) !== null
    || readSessionRestoreContent(message.content) !== null
    || readSessionThinkingLevelContent(message.content) !== null;
}

export class SessionControlRuntime {
  constructor(
    private readonly channelBus: ChannelBus,
    private readonly agentRuntimes: Map<string, AgentChannelRuntime>,
  ) {}

  async handleMessage(
    channel: string,
    message: ChannelMessage,
    source: DispatchSource,
  ): Promise<boolean> {
    const reset = readSessionResetContent(message.content);
    if (reset) {
      await this.resetChannelSession(channel, reset.targetAgentId, source);
      return true;
    }

    const restore = readSessionRestoreContent(message.content);
    if (restore) {
      await this.restoreChannelSession(
        channel,
        restore.targetAgentId,
        restore.archiveName,
        source,
      );
      return true;
    }

    const thinking = readSessionThinkingLevelContent(message.content);
    if (thinking) {
      await this.setChannelThinkingLevel(
        channel,
        thinking.targetAgentId,
        thinking.level,
        source,
      );
      return true;
    }

    return false;
  }

  private getAgentRuntime(
    channel: string,
    agentId: string,
    source: DispatchSource,
    action: "reset" | "restore" | "thinking",
  ): AgentChannelRuntime | null {
    const agentRuntime = this.agentRuntimes.get(agentId);
    if (!agentRuntime) {
      console.error(
        `[delivery] ${source} session ${action} ignored for ${channel}; unknown agent ${agentId}`,
      );
      return null;
    }
    return agentRuntime;
  }

  private async resetChannelSession(
    channel: string,
    agentId: string,
    source: DispatchSource,
  ): Promise<void> {
    const agentRuntime = this.getAgentRuntime(channel, agentId, source, "reset");
    if (!agentRuntime) return;

    try {
      await agentRuntime.reset(channel);
      await this.channelBus.deliverText(
        channel,
        `Started a new session for ${agentId}.`,
      );
    } catch (err) {
      console.error(
        `[delivery] ${source} session reset error for ${channel} (agent ${agentId}):`,
        err,
      );
      await this.channelBus.deliverText(
        channel,
        `Failed to start a new session for ${agentId}: ${formatDispatchError(err)}`,
      );
    }
  }

  private async restoreChannelSession(
    channel: string,
    agentId: string,
    archiveName: string | undefined,
    source: DispatchSource,
  ): Promise<void> {
    const agentRuntime = this.getAgentRuntime(channel, agentId, source, "restore");
    if (!agentRuntime) return;

    try {
      const restored = await agentRuntime.restore(channel, archiveName);
      await this.channelBus.deliverText(
        channel,
        `Restored session for ${agentId} from ${restored.restoredFrom}.`,
      );
    } catch (err) {
      console.error(
        `[delivery] ${source} session restore error for ${channel} (agent ${agentId}):`,
        err,
      );
      await this.channelBus.deliverText(
        channel,
        `Failed to restore session for ${agentId}: ${formatDispatchError(err)}`,
      );
    }
  }

  private async setChannelThinkingLevel(
    channel: string,
    agentId: string,
    level: string,
    source: DispatchSource,
  ): Promise<void> {
    const agentRuntime = this.getAgentRuntime(channel, agentId, source, "thinking");
    if (!agentRuntime) return;

    try {
      if (!isThinkingLevel(level)) {
        throw new Error(`invalid thinking level: ${level}`);
      }

      const result = await agentRuntime.setThinkingLevel(
        channel,
        level as ThinkingLevel,
      );
      const description = result.effectiveLevel === result.requestedLevel
        ? result.effectiveLevel
        : `${result.effectiveLevel} (requested ${result.requestedLevel})`;
      await this.channelBus.deliverText(
        channel,
        `Set thinking level for ${agentId} to ${description}.`,
      );
    } catch (err) {
      console.error(
        `[delivery] ${source} session thinking error for ${channel} (agent ${agentId}):`,
        err,
      );
      await this.channelBus.deliverText(
        channel,
        `Failed to set thinking level for ${agentId}: ${formatDispatchError(err)}`,
      );
    }
  }
}

function formatDispatchError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return String(err);
}
