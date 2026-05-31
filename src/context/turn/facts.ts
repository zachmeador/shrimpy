import {
  explainAgentMessageHandling,
  searchableText,
} from "../../agents/channel-policy.js";
import type { AppRuntime } from "../../app/runtime.js";
import { resolveAgentDmMembers } from "../../channels/dm.js";
import type { ChannelMessage } from "../../channels/index.js";
import type { SessionDescriptor } from "../../sessions/spec.js";
import { formatAgentDateTime } from "./time.js";
import type { TurnContextItem } from "./types.js";

export interface TurnFactInput {
  runtime: AppRuntime;
  descriptor: SessionDescriptor;
  agentId: string;
  currentMessage?: ChannelMessage;
}

export function buildTurnFactItems(input: TurnFactInput): TurnContextItem[] {
  const { currentMessage: message } = input;
  const channel = input.descriptor.channel;
  if (!message || !channel) return [];

  return [
    buildRouteItem(channel, message),
    buildAgentDmItem(input, channel),
    buildAddressedItem(input.agentId, channel, message),
    buildAttentionItem(input, channel, message),
    buildSchedulerItem(message),
  ].filter((item): item is TurnContextItem => item !== undefined);
}

function buildRouteItem(
  channel: string,
  message: ChannelMessage,
): TurnContextItem {
  const route = [
    `routed via ${message.origin.transport}`,
    `from ${senderLabel(message)}`,
    `in channel ${channel}`,
  ];
  if (message.origin.sourceChannel && message.origin.sourceChannel !== channel) {
    route.push(`source ${message.origin.sourceChannel}`);
  }
  if (message.origin.transportChatId) {
    route.push(`chat ${message.origin.transportChatId}`);
  }
  if (message.origin.transportUserId) {
    route.push(`transport user ${message.origin.transportUserId}`);
  }

  return {
    id: `turn:${message.id}:route`,
    summary: route.join("; "),
    inspect: `shrimpy channels read ${channel} --after ${message.id}`,
  };
}

function buildAgentDmItem(
  input: TurnFactInput,
  channel: string,
): TurnContextItem | undefined {
  const members = resolveAgentDmMembers(channel, input.runtime.resolved.agents);
  if (!members) return undefined;

  return {
    id: `turn:${channel}:agent-dm`,
    summary: members.length > 0
      ? `agent DM: ${channel} is an internal channel for ${members.join(", ")}; "no external adapter" only means no surface send`
      : `agent DM: ${channel} looks like a DM, but one or more members are not configured agents`,
    inspect: `shrimpy channels members ${channel}`,
  };
}

function buildAddressedItem(
  agentId: string,
  channel: string,
  message: ChannelMessage,
): TurnContextItem | undefined {
  const addressed = message.origin.addressedAgentId;
  if (!addressed) return undefined;

  return {
    id: `turn:${message.id}:addressed`,
    summary: addressed === agentId
      ? `addressed to ${agentId} by origin.addressedAgentId`
      : `addressed to ${addressed} by origin.addressedAgentId`,
    inspect: attentionInspectCommand(agentId, channel, message),
  };
}

function buildAttentionItem(
  input: TurnFactInput,
  channel: string,
  message: ChannelMessage,
): TurnContextItem | undefined {
  const agent = getKnownAgent(input.runtime, input.agentId);
  if (!agent) return undefined;
  const explanation = explainAgentMessageHandling(agent, channel, message);
  if (!explanation.handles) return undefined;

  return {
    id: `turn:${message.id}:attention`,
    summary: `attention: handled because ${explanation.reason}`,
    inspect: attentionInspectCommand(input.agentId, channel, message),
  };
}

function buildSchedulerItem(message: ChannelMessage): TurnContextItem | undefined {
  if (message.origin.transport !== "scheduler") return undefined;
  const pieces = ["scheduled wake"];
  if (message.origin.scheduleId) pieces.push(message.origin.scheduleId);
  if (message.origin.runId) pieces.push(`run ${message.origin.runId}`);
  pieces.push(`fired ${formatAgentDateTime(message.timestamp)}`);

  return {
    id: `turn:${message.id}:scheduler`,
    summary: pieces.join("; "),
    inspect: "shrimpy gateway status",
  };
}

function attentionInspectCommand(
  agentId: string,
  channel: string,
  message: ChannelMessage,
): string {
  const text = searchableText(message) || `[${message.content.type}]`;
  return [
    "shrimpy agent attention test",
    agentId,
    "--channel",
    channel,
    "--sender",
    message.sender.kind,
    "--actor-id",
    message.sender.actorId,
    message.sender.userId ? `--user-id ${message.sender.userId}` : "",
    message.origin.addressedAgentId
      ? `--addressed ${message.origin.addressedAgentId}`
      : "",
    "--text",
    shellQuote(text),
  ].filter(Boolean).join(" ");
}

function senderLabel(message: ChannelMessage): string {
  return message.sender.displayName
    ? `${message.sender.kind}:${message.sender.displayName}`
    : `${message.sender.kind}:${message.sender.actorId}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function getKnownAgent(
  runtime: AppRuntime,
  agentId: string,
): ReturnType<AppRuntime["getAgent"]> | undefined {
  try {
    return runtime.getAgent(agentId);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("unknown agent:")) {
      return undefined;
    }
    throw err;
  }
}
