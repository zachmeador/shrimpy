export type ToolProseId =
  | "send_message"
  | "read_channel"
  | "run_child";

export interface ToolProse {
  description: string;
  promptSnippet: string;
}

const AGENT_DM_CHANNEL_DESCRIPTION =
  'Direct agent DMs use channel names like "dm~agent-a~agent-b" with the two agent ids sorted alphabetically.';

const TOOL_PROSE: Record<ToolProseId, ToolProse> = {
  send_message: {
    description:
      "Send a message to a channel. Use this to reply on user-facing surfaces or to message another agent. The message is delivered through the appropriate surface adapter when one is configured and is always recorded in the channel log.",
    promptSnippet: "send_message — send a response to a channel",
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
}): string {
  return data.delivered
    ? `Delivered to the user on ${data.channel}. Wait until a new message is received.`
    : `Logged to ${data.channel} (no adapter for delivery). Wait until a new message is received.`;
}

export function renderReadChannelResult(data: { messages: unknown[] }): string {
  return JSON.stringify(data.messages, null, 2);
}

export function renderRunChildResult(data: { assistantText: string }): string {
  return data.assistantText || "(no response from child session)";
}
