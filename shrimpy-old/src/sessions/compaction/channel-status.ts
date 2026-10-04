import type { ChannelBus } from "../../channels/bus.js";
import type { ChannelMessage } from "../../channels/protocol.js";
import {
  createChannelSessionKey,
  formatSessionId,
} from "../identity.js";
import {
  isTerminalCompactionFailure,
  type SessionCompactionEndEvent,
} from "./events.js";

export function publishTerminalCompactionFailureStatus(input: {
  channelBus: ChannelBus;
  channel: string;
  agentId: string;
  event: SessionCompactionEndEvent;
}): ChannelMessage | null {
  if (!isTerminalCompactionFailure(input.event)) return null;

  const sessionId = formatSessionId(createChannelSessionKey({
    agentId: input.agentId,
    channel: input.channel,
  }));
  return input.channelBus.publishStatus({
    channel: input.channel,
    actorId: "system:compaction",
    transport: "internal",
    sourceChannel: input.channel,
    data: {
      kind: "operation_status",
      operation: "compaction",
      ok: false,
      targetAgentId: input.agentId,
      text: (
        `Compaction failed for ${input.agentId}. If this keeps happening, inspect `
        + `\`shrimpy sessions compaction ${sessionId} --agent ${input.agentId}\` `
        + "and `shrimpy gateway logs`."
      ),
    },
  });
}
