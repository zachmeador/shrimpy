import {
  evaluateAgentChannelPolicy,
  searchableText,
} from "../../agents/channel-policy.js";
import type { AppRuntime } from "../../app/runtime.js";
import { resolveAgentDmMembers } from "../../channels/dm.js";
import type { ChannelMessage } from "../../channels/index.js";
import type { SessionDescriptor } from "../../sessions/spec.js";
import { sessionChannel } from "../../sessions/spec.js";
import { formatAgentDateTime } from "./time.js";
import type { TurnContextItem } from "./types.js";

interface TurnFactInput {
  runtime: AppRuntime;
  descriptor: SessionDescriptor;
  agentId: string;
  currentMessage?: ChannelMessage;
}

export function buildTurnFactItems(input: TurnFactInput): TurnContextItem[] {
  const { currentMessage: message } = input;
  const channel = sessionChannel(input.descriptor);
  if (!message || !channel) return [];

  return [
    buildRouteItem(channel, message),
    buildAgentDmItem(input, channel),
    buildAddressedItem(input.agentId, channel, message),
    buildWakeItem(input, channel, message),
    buildWatchItem(message),
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
    inspect: wakeInspectCommand(agentId, channel, message),
  };
}

function buildWakeItem(
  input: TurnFactInput,
  channel: string,
  message: ChannelMessage,
): TurnContextItem | undefined {
  const agent = getKnownAgent(input.runtime, input.agentId);
  if (!agent) return undefined;
  const decision = evaluateAgentChannelPolicy(agent, channel, message, {
    visible: true,
  });
  if (decision.action !== "wake") return undefined;

  return {
    id: `turn:${message.id}:wake`,
    summary: `wake: ${decision.reason}; policy owner agent:${input.agentId}`,
    inspect: wakeInspectCommand(input.agentId, channel, message),
  };
}

function buildWatchItem(message: ChannelMessage): TurnContextItem | undefined {
  if (message.origin.transport !== "watch") return undefined;
  const pieces = ["watch message"];
  if (message.origin.watchId) pieces.push(message.origin.watchId);
  if (message.origin.watch?.ownerAgentId) {
    pieces.push(`owner ${message.origin.watch.ownerAgentId}`);
  }
  if (message.origin.watch?.localId) {
    pieces.push(`local ${message.origin.watch.localId}`);
  }
  if (message.origin.watch?.targetChannel) {
    pieces.push(`target ${message.origin.watch.targetChannel}`);
  }
  if (message.origin.watch?.actionKind) {
    pieces.push(`action ${message.origin.watch.actionKind}`);
  }
  if (message.origin.runId) pieces.push(`run ${message.origin.runId}`);
  pieces.push(`fired ${formatAgentDateTime(message.timestamp)}`);

  return {
    id: `turn:${message.id}:watch`,
    summary: pieces.join("; "),
    inspect: message.origin.watchId
      ? `shrimpy watches show ${message.origin.watchId}`
      : "shrimpy gateway status",
  };
}

function wakeInspectCommand(
  agentId: string,
  channel: string,
  message: ChannelMessage,
): string {
  const text = searchableText(message) || `[${message.content.type}]`;
  return [
    "shrimpy agent channel-policy explain",
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
