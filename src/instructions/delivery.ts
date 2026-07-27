import { defineInstruction } from "./definition.js";

type ToolProseId =
  | "reply"
  | "ask"
  | "notify"
  | "report"
  | "send_message"
  | "read_channel";

interface ToolProseDefinitions {
  description: ReturnType<typeof defineInstruction>;
  promptSnippet: ReturnType<typeof defineInstruction>;
}

const AGENT_DM_CHANNEL_DESCRIPTION =
  'Direct agent DMs use channel names like "dm~agent-a~agent-b"; `shrimpy channels dm` creates the canonical sorted name. A message from either named member addresses and wakes the other member according to its channel policy. Agent DMs are internal channels, not external surface chats.';

export const channelDeliveryGuidance = defineInstruction(
  "session.delivery.channel",
  ({ channel }: { channel: string }) => [
    "Plain assistant text is private and never reaches the channel.",
    "Use reply(text) for a normal user-visible response; use ask(text), notify(text), or report(summary) when those intents fit.",
    `Use send_message(channel="${channel}", text="...") only for explicit routing to another destination. A user:<id> alias targets that user's last active chat surface; agent DM channels are internal and have no external adapter by default.`,
    ...(isAgentDmChannel(channel)
      ? ["If the other agent's message only closes the exchange—for example, an acknowledgment, thanks, or sign-off—with no new question or task, do not publish a reply. End the turn silently."]
      : []),
    "After publishing, do not duplicate the message in plain assistant text; wait for another incoming message.",
  ].join("\n"),
);

export const transcriptDelivery = defineInstruction(
  "session.delivery.transcript",
  [
    "The user sees ordinary assistant text in this transcript.",
    "",
    "- Answer the current conversation with normal assistant messages.",
    "- Do not use reply(text), ask(text), notify(text), or report(summary) for this in-session conversation; those helpers are for channel-bound turns.",
    "- Use send_message(channel=\"...\", text=\"...\") only when explicitly asked to send or log something to a Shrimpy channel, user:<id> alias, or agent DM. Agent DMs are internal channels, so no external adapter is expected.",
  ].join("\n"),
);

export const channelTurnDelivery = defineInstruction(
  "turn.delivery.channel",
  "This is a channel turn. Use a publication tool for every user-visible message; for a normal response, call reply. Plain assistant text is private and does not reach the user. Do not duplicate published messages in plain assistant text.",
);

const toolProse: Record<ToolProseId, ToolProseDefinitions> = {
  reply: {
    description: defineInstruction("tool.reply.description", "Publish a concise response to the active gateway/channel turn. This is only for sessions handling channel messages; in TUI or run sessions, answer with ordinary assistant text."),
    promptSnippet: defineInstruction("tool.reply.prompt-snippet", "reply — publish a response to the active gateway channel"),
  },
  ask: {
    description: defineInstruction("tool.ask.description", "Publish a question to the active gateway/channel turn. This is only for sessions handling channel messages; in TUI or run sessions, ask with ordinary assistant text."),
    promptSnippet: defineInstruction("tool.ask.prompt-snippet", "ask — ask the user a question on the active gateway channel"),
  },
  notify: {
    description: defineInstruction("tool.notify.description", "Publish a brief notification to the active gateway/channel turn. Supports intent metadata such as urgency, quiet delivery, and batchability."),
    promptSnippet: defineInstruction("tool.notify.prompt-snippet", "notify — publish a notification to the active gateway channel"),
  },
  report: {
    description: defineInstruction("tool.report.description", "Publish a concise completion report or summary to the active gateway/channel turn."),
    promptSnippet: defineInstruction("tool.report.prompt-snippet", "report — publish a completion report to the active gateway channel"),
  },
  send_message: {
    description: defineInstruction("tool.send-message.description", "Send a message to an explicit channel or user:<id> alias. Use this lower-level primitive for unusual routing or agent DMs, not for answering the current TUI/run conversation."),
    promptSnippet: defineInstruction("tool.send-message.prompt-snippet", "send_message — send text to an explicit channel"),
  },
  read_channel: {
    description: defineInstruction("tool.read-channel.description", "Read recent messages from a channel. Returns the most recent messages as JSON, including private DM channels."),
    promptSnippet: defineInstruction("tool.read-channel.prompt-snippet", "read_channel — read messages from a channel"),
  },
};

export const toolProseInstructions = toolProse;

export const toolParameterInstructions = {
  activePublicationText: defineInstruction("tool.publication.parameter.text", "User-facing text to publish to the active channel"),
  activePublicationSummary: defineInstruction("tool.report.parameter.summary", "User-facing summary to publish to the active channel"),
  activePublicationUrgency: defineInstruction("tool.notify.parameter.urgency", "Notification urgency: low, normal, or high"),
  activePublicationQuiet: defineInstruction("tool.notify.parameter.quiet", "Whether the surface should avoid interruptive delivery when supported"),
  activePublicationBatchable: defineInstruction("tool.notify.parameter.batchable", "Whether this notification can be batched by a surface adapter when supported"),
  sendMessageChannel: defineInstruction("tool.send-message.parameter.channel", `Channel name (e.g. telegram~shrimpy~12345) or user:<id> for that user's last active chat surface. ${AGENT_DM_CHANNEL_DESCRIPTION}`),
  sendMessageText: defineInstruction("tool.send-message.parameter.text", "Message text to send"),
  readChannelChannel: defineInstruction("tool.read-channel.parameter.channel", `Channel name. ${AGENT_DM_CHANNEL_DESCRIPTION}`),
  readChannelLimit: defineInstruction("tool.read-channel.parameter.limit", "Max messages to return (default 20)"),
};

export function renderToolProse(toolId: ToolProseId): {
  description: string;
  promptSnippet: string;
} {
  const prose = toolProse[toolId];
  return {
    description: prose.description.render(),
    promptSnippet: prose.promptSnippet.render(),
  };
}

export const sendMessageResult = defineInstruction(
  "tool.send-message.result",
  (
    { channel, waitForNewMessage, addressedAgentId }: {
      channel: string;
      waitForNewMessage?: boolean;
      addressedAgentId?: string;
    },
  ) => {
    const suffix = waitForNewMessage ? " Wait until a new message is received." : "";
    if (isAgentDmChannel(channel)) {
      if (addressedAgentId) {
        return `Sent to ${addressedAgentId} in agent DM ${channel}. The message is internally addressed to ${addressedAgentId}.${suffix}`;
      }
      return `Logged to agent DM ${channel}. No external adapter is expected; gateway channel routing handles DM members.${suffix}`;
    }
    return `Logged to ${channel} for outbound delivery.${suffix}`;
  },
);

export const publicationResult = defineInstruction(
  "tool.publication.result",
  (
    { intent, channel, addressedAgentId }: {
      intent: "reply" | "ask" | "notify" | "report";
      channel: string;
      addressedAgentId?: string;
    },
  ) => {
    if (isAgentDmChannel(channel)) {
      if (addressedAgentId) {
        return `Sent ${intent} to ${addressedAgentId} in agent DM ${channel}. The message is internally addressed to ${addressedAgentId}. Wait until a new message is received.`;
      }
      return `Logged ${intent} to agent DM ${channel}. No external adapter is expected; gateway channel routing handles DM members. Wait until a new message is received.`;
    }
    return `Logged ${intent} to ${channel} for outbound delivery. Wait until a new message is received.`;
  },
);

export const readChannelResult = defineInstruction(
  "tool.read-channel.result",
  ({ messages }: { messages: unknown[] }) => JSON.stringify(messages, null, 2),
);

function isAgentDmChannel(channel: string): boolean {
  const parts = channel.split("~");
  return parts.length === 3 && parts[0] === "dm" && parts[1] !== "" && parts[2] !== "";
}
