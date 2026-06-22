import type { AgentChannelRuntime } from "../agents/channel-runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  isThinkingLevel,
  type ThinkingLevel,
} from "../sessions/thinking.js";
import {
  readSessionControlContent,
  type ChannelMessage,
} from "../channels/index.js";

export type DispatchSource = "backlog" | "live";

export function isSessionControlMessage(message: ChannelMessage): boolean {
  return readSessionControlContent(message.content) !== null;
}

export function getSessionControlTargetAgentId(
  message: ChannelMessage,
): string | null {
  return readSessionControlContent(message.content)?.targetAgentId ?? null;
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
    const control = readSessionControlContent(message.content);
    if (!control) return false;

    switch (control.kind) {
      case "session_reset":
        await this.resetChannelSession(channel, control.targetAgentId, source);
        return true;
      case "session_restore":
        await this.restoreChannelSession(
          channel,
          control.targetAgentId,
          control.archiveName,
          source,
        );
        return true;
      case "session_thinking_level":
        await this.setChannelThinkingLevel(
          channel,
          control.targetAgentId,
          control.level,
          source,
        );
        return true;
      case "session_stop":
        await this.stopChannelSession(channel, control.targetAgentId, source);
        return true;
    }

    const exhaustive: never = control;
    return exhaustive;
  }

  private getAgentRuntime(
    channel: string,
    agentId: string,
    source: DispatchSource,
    action: "reset" | "restore" | "thinking" | "stop",
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
      this.publishOperationStatus(
        channel,
        agentId,
        "reset",
        true,
        `Started a new session for ${agentId}.`,
      );
    } catch (err) {
      console.error(
        `[delivery] ${source} session reset error for ${channel} (agent ${agentId}):`,
        err,
      );
      this.publishOperationStatus(
        channel,
        agentId,
        "reset",
        false,
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
      this.publishOperationStatus(
        channel,
        agentId,
        "restore",
        true,
        `Restored session for ${agentId} from ${restored.restoredFrom}.`,
      );
    } catch (err) {
      console.error(
        `[delivery] ${source} session restore error for ${channel} (agent ${agentId}):`,
        err,
      );
      this.publishOperationStatus(
        channel,
        agentId,
        "restore",
        false,
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
      this.publishOperationStatus(
        channel,
        agentId,
        "thinking",
        true,
        `Set thinking level for ${agentId} to ${description}.`,
      );
    } catch (err) {
      console.error(
        `[delivery] ${source} session thinking error for ${channel} (agent ${agentId}):`,
        err,
      );
      this.publishOperationStatus(
        channel,
        agentId,
        "thinking",
        false,
        `Failed to set thinking level for ${agentId}: ${formatDispatchError(err)}`,
      );
    }
  }

  private async stopChannelSession(
    channel: string,
    agentId: string,
    source: DispatchSource,
  ): Promise<void> {
    const agentRuntime = this.getAgentRuntime(channel, agentId, source, "stop");
    if (!agentRuntime) return;

    try {
      const result = agentRuntime.stop(channel);
      this.publishOperationStatus(
        channel,
        agentId,
        "stop",
        true,
        result.stopped
          ? `Stopped the running turn for ${agentId}.`
          : `No running turn for ${agentId} on ${channel}.`,
      );
    } catch (err) {
      console.error(
        `[delivery] ${source} session stop error for ${channel} (agent ${agentId}):`,
        err,
      );
      this.publishOperationStatus(
        channel,
        agentId,
        "stop",
        false,
        `Failed to stop the running turn for ${agentId}: ${formatDispatchError(err)}`,
      );
    }
  }

  private publishOperationStatus(
    channel: string,
    agentId: string,
    operation: string,
    ok: boolean,
    text: string,
  ): void {
    this.channelBus.publishStatus({
      channel,
      actorId: "system:session-control",
      transport: "internal",
      sourceChannel: channel,
      data: {
        kind: "operation_status",
        text,
        ok,
        targetAgentId: agentId,
        operation,
      },
    });
  }
}

function formatDispatchError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  return String(err);
}
