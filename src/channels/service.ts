import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelMessage } from "./index.js";
import { buildAgentDmChannel } from "./dm.js";
import {
  channelAgentIds,
  type ChannelMembership,
} from "./membership.js";

export interface ChannelMessagePreview {
  id: string;
  timestamp: number;
  sender: ChannelMessage["sender"];
  origin: ChannelMessage["origin"];
  contentType: ChannelMessage["content"]["type"];
  preview: string;
}

export interface ChannelSummary {
  channel: string;
  path: string;
  exists: boolean;
  messageCount: number;
  membership: ChannelMembership;
  lastMessage: ChannelMessagePreview | null;
}

export function listChannelSummaries(runtime: AppRuntime): ChannelSummary[] {
  const memberships = runtime.createChannelMembershipStore();
  const names = listChannelNames(runtime.paths.channelsDir, memberships.listChannels());
  return names.map((channel) => summarizeChannel(runtime, channel));
}

export function summarizeChannel(
  runtime: AppRuntime,
  channel: string,
): ChannelSummary {
  const channelBus = runtime.createChannelBus();
  const memberships = runtime.createChannelMembershipStore();
  const path = channelBus.path(channel);
  const exists = existsSync(path);
  const messages = exists ? channelBus.read(channel).messages : [];
  const membership = memberships.get(channel) ?? (channel === "home"
    ? memberships.seedChannel(channel)
    : { agents: {} });

  return {
    channel,
    path,
    exists,
    messageCount: messages.length,
    membership,
    lastMessage: messages.length > 0 ? summarizeMessage(messages[messages.length - 1]!) : null,
  };
}

export function readRecentChannelMessages(
  runtime: AppRuntime,
  channel: string,
  limit: number,
): ChannelMessage[] {
  const channelBus = runtime.createChannelBus();
  const path = channelBus.path(channel);
  if (!existsSync(path)) {
    throw new Error(`channel not found: ${channel}`);
  }

  const { messages } = channelBus.read(channel);
  return messages.slice(-limit);
}

export function ensureChannelMembership(
  runtime: AppRuntime,
  channel: string,
): ChannelMembership {
  return runtime.createChannelMembershipStore().seedChannel(channel);
}

export function ensureDirectMessageChannel(
  runtime: AppRuntime,
  agentA: string,
  agentB: string,
): {
  channel: string;
  membership: ChannelMembership;
} {
  runtime.getAgent(agentA);
  runtime.getAgent(agentB);

  const channel = buildAgentDmChannel(agentA, agentB);
  return {
    channel,
    membership: runtime.createChannelMembershipStore().seedChannel(channel),
  };
}

export function updateChannelMembership(
  runtime: AppRuntime,
  input: {
    action: "join" | "leave";
    channel: string;
    agentId: string;
  },
): ChannelMembership {
  runtime.getAgent(input.agentId);
  const memberships = runtime.createChannelMembershipStore();
  return input.action === "join"
    ? memberships.addAgent(input.channel, input.agentId)
    : memberships.removeAgent(input.channel, input.agentId);
}

export function formatChannelAgentIds(membership: ChannelMembership): string[] {
  return channelAgentIds(membership);
}

function listChannelNames(
  channelsDir: string,
  configuredChannels: string[],
): string[] {
  const names = new Set(configuredChannels);
  if (existsSync(channelsDir)) {
    for (const file of readdirSync(channelsDir)) {
      if (!file.endsWith(".jsonl")) continue;
      names.add(basename(file, ".jsonl"));
    }
  }
  return [...names].sort();
}

function clipText(text: string, max = 120): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function summarizeMessage(message: ChannelMessage): ChannelMessagePreview {
  return {
    id: message.id,
    timestamp: message.timestamp,
    sender: message.sender,
    origin: message.origin,
    contentType: message.content.type,
    preview: message.content.type === "text"
      ? clipText(message.content.data.text)
      : JSON.stringify(message.content.data),
  };
}
