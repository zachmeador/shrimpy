export type ToolProseId =
  | "reply"
  | "ask"
  | "notify"
  | "report"
  | "send_message"
  | "read_channel"
  | "run_child";

export interface ToolProse {
  description: string;
  promptSnippet: string;
}

const AGENT_DM_CHANNEL_DESCRIPTION =
  'Direct agent DMs use channel names like "dm~agent-a~agent-b"; `shrimpy channels dm` creates the canonical sorted name. Agent DMs are internal channels, not external surface chats.';

const TOOL_PROSE: Record<ToolProseId, ToolProse> = {
  reply: {
    description:
      "Publish a concise response to the active gateway/channel turn. This is only for sessions handling channel messages; in TUI or run sessions, answer with ordinary assistant text.",
    promptSnippet: "reply — publish a response to the active gateway channel",
  },
  ask: {
    description:
      "Publish a question to the active gateway/channel turn. This is only for sessions handling channel messages; in TUI or run sessions, ask with ordinary assistant text.",
    promptSnippet: "ask — ask the user a question on the active gateway channel",
  },
  notify: {
    description:
      "Publish a brief notification to the active gateway/channel turn. Supports intent metadata such as urgency, quiet delivery, and batchability.",
    promptSnippet: "notify — publish a notification to the active gateway channel",
  },
  report: {
    description:
      "Publish a concise completion report or summary to the active gateway/channel turn.",
    promptSnippet: "report — publish a completion report to the active gateway channel",
  },
  send_message: {
    description:
      "Send a message to an explicit channel. Use this lower-level primitive for unusual routing or agent DMs, not for answering the current TUI/run conversation.",
    promptSnippet: "send_message — send text to an explicit channel",
  },
  read_channel: {
    description:
      "Read recent messages from a channel. Returns the most recent messages as JSON, including private DM channels.",
    promptSnippet: "read_channel — read messages from a channel",
  },
  run_child: {
    description:
      "Launch a fresh child run with the same agent, auth, and models as the current session. The child runs to completion and returns its result.",
    promptSnippet: "run_child — launch a fresh child run",
  },
};

export const TOOL_PARAMETER_PROSE = {
  activePublicationText: "User-facing text to publish to the active channel",
  activePublicationSummary: "User-facing summary to publish to the active channel",
  activePublicationUrgency: "Notification urgency: low, normal, or high",
  activePublicationQuiet: "Whether the surface should avoid interruptive delivery when supported",
  activePublicationBatchable: "Whether this notification can be batched by a surface adapter when supported",
  sendMessageChannel:
    `Channel name (e.g. telegram~shrimpy~12345). ${AGENT_DM_CHANNEL_DESCRIPTION}`,
  sendMessageText: "Message text to send",
  readChannelChannel: `Channel name. ${AGENT_DM_CHANNEL_DESCRIPTION}`,
  readChannelLimit: "Max messages to return (default 20)",
  runChildPrompt: "The prompt for the fresh child run",
};

export function getToolProse(toolId: ToolProseId): ToolProse {
  return TOOL_PROSE[toolId];
}

export function renderSendMessageResult(data: {
  channel: string;
  delivered: boolean;
  waitForNewMessage?: boolean;
}): string {
  const suffix = data.waitForNewMessage ? " Wait until a new message is received." : "";
  if (data.delivered) {
    return `Logged to ${data.channel} and delivered through an external adapter.${suffix}`;
  }
  if (isAgentDmChannel(data.channel)) {
    return `Logged to agent DM ${data.channel}. No external adapter is expected; gateway channel routing handles DM members.${suffix}`;
  }
  return `Logged to ${data.channel}. No external adapter matched for outbound delivery.${suffix}`;
}

export function renderPublicationResult(data: {
  intent: "reply" | "ask" | "notify" | "report";
  channel: string;
  delivered: boolean;
}): string {
  if (data.delivered) {
    return `Published ${data.intent} to ${data.channel} and delivered through an external adapter. Wait until a new message is received.`;
  }
  if (isAgentDmChannel(data.channel)) {
    return `Logged ${data.intent} to agent DM ${data.channel}. No external adapter is expected; gateway channel routing handles DM members. Wait until a new message is received.`;
  }
  return `Logged ${data.intent} to ${data.channel}. No external adapter matched for outbound delivery. Wait until a new message is received.`;
}

export function renderReadChannelResult(data: { messages: unknown[] }): string {
  return JSON.stringify(data.messages, null, 2);
}

export function renderRunChildResult(data: { assistantText: string }): string {
  return data.assistantText || "(no response from child session)";
}

function isAgentDmChannel(channel: string): boolean {
  const parts = channel.split("~");
  return parts.length === 3 && parts[0] === "dm" && parts[1] !== "" && parts[2] !== "";
}
