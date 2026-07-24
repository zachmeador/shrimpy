import { basename } from "node:path";
import type { AgentChannelRuntime } from "../agents/channel-runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import { readSessionControlContent } from "../channels/messages.js";
import type { ChannelMessage } from "../channels/protocol.js";
import { isThinkingLevel } from "../config/thinking.js";
import type { ModelRef } from "../config/model.js";
import type { ThinkingLevel } from "../config/thinking.js";

export type DispatchSource = "backlog" | "live";
type SessionControl = NonNullable<ReturnType<typeof readSessionControlContent>>;
type Operation = "reset" | "restore" | "set" | "thinking" | "stop";

interface ControlSuccess {
  operation: Operation;
  text: string;
  archiveName?: string;
  thinking?: ThinkingLevel;
  model?: ModelRef;
}

const OPERATION_DESCRIPTION: Record<Operation, string> = {
  reset: "start a new session",
  restore: "restore the session",
  set: "set session settings",
  thinking: "set the thinking level",
  stop: "stop the running turn",
};

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

    const operation = operationFor(control);
    const runtime = this.agentRuntimes.get(control.targetAgentId);
    if (!runtime) {
      console.error(
        `[delivery] ${source} session ${operation} ignored for ${channel}; unknown agent ${control.targetAgentId}`,
      );
      this.publish(channel, control.targetAgentId, message.id, {
        operation,
        text: `Failed to ${OPERATION_DESCRIPTION[operation]} for ${control.targetAgentId}: unknown agent.`,
      }, false);
      return true;
    }

    try {
      this.publish(
        channel,
        control.targetAgentId,
        message.id,
        await runControl(runtime, channel, control),
        true,
      );
    } catch (err) {
      console.error(
        `[delivery] ${source} session ${operation} error for ${channel} (agent ${control.targetAgentId}):`,
        err,
      );
      this.publish(channel, control.targetAgentId, message.id, {
        operation,
        text: `Failed to ${OPERATION_DESCRIPTION[operation]} for ${control.targetAgentId}: ${formatError(err)}`,
      }, false);
    }
    return true;
  }

  private publish(
    channel: string,
    agentId: string,
    requestMessageId: string,
    result: ControlSuccess,
    ok: boolean,
  ): void {
    this.channelBus.publishStatus({
      channel,
      actorId: "system:session-control",
      transport: "internal",
      sourceChannel: channel,
      data: {
        kind: "operation_status",
        text: result.text,
        ok,
        targetAgentId: agentId,
        operation: result.operation,
        requestMessageId,
        ...(result.archiveName ? { archiveName: result.archiveName } : {}),
        ...(result.thinking ? { thinking: result.thinking } : {}),
        ...(result.model ? { model: result.model } : {}),
      },
    });
  }
}

async function runControl(
  runtime: AgentChannelRuntime,
  channel: string,
  control: SessionControl,
): Promise<ControlSuccess> {
  const agentId = control.targetAgentId;
  switch (control.kind) {
    case "session_reset": {
      const result = await runtime.reset(channel);
      return {
        operation: "reset",
        text: `Started a new session for ${agentId}.`,
        ...(result.archivedTo ? { archiveName: basename(result.archivedTo) } : {}),
      };
    }
    case "session_restore": {
      const result = await runtime.restore(channel, control.archiveName);
      return {
        operation: "restore",
        text: `Restored session for ${agentId} from ${result.restoredFrom}.`,
        archiveName: basename(result.restoredFrom),
      };
    }
    case "session_thinking_level": {
      if (!isThinkingLevel(control.level)) {
        throw new Error(`invalid thinking level: ${control.level}`);
      }
      const result = await runtime.setThinkingLevel(channel, control.level);
      const level = result.effectiveLevel === result.requestedLevel
        ? result.effectiveLevel
        : `${result.effectiveLevel} (requested ${result.requestedLevel})`;
      return {
        operation: "thinking",
        text: `Set thinking level for ${agentId} to ${level}.`,
      };
    }
    case "session_settings": {
      const result = await runtime.setSettings(channel, {
        thinking: control.thinking,
        model: control.model,
        modelPolicy: control.modelPolicy,
      });
      const settings = [
        result.effectiveThinking ? `thinking=${result.effectiveThinking}` : undefined,
        result.effectiveModel
          ? `model=${result.effectiveModel.provider}/${result.effectiveModel.id}`
          : undefined,
      ].filter((value): value is string => Boolean(value));
      return {
        operation: "set",
        text: `Set session ${settings.join(" and ")} for ${agentId}.`,
        ...(result.effectiveThinking ? { thinking: result.effectiveThinking } : {}),
        ...(result.effectiveModel ? { model: result.effectiveModel } : {}),
      };
    }
    case "session_stop": {
      const result = runtime.stop(channel);
      return {
        operation: "stop",
        text: result.stopped
          ? `Stopped the running turn for ${agentId}.`
          : `No running turn for ${agentId} on ${channel}.`,
      };
    }
  }
}

function operationFor(control: SessionControl): Operation {
  switch (control.kind) {
    case "session_reset": return "reset";
    case "session_restore": return "restore";
    case "session_settings": return "set";
    case "session_thinking_level": return "thinking";
    case "session_stop": return "stop";
  }
}

function formatError(err: unknown): string {
  return err instanceof Error && err.message.trim() ? err.message.trim() : String(err);
}
