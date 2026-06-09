import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import type {
  ChannelMessage,
  MessageSenderKind,
} from "./index.js";
import { buildAgentDmChannel } from "./dm.js";
import {
  channelAgentIds,
  type ChannelMembership,
} from "./membership.js";

export const CHANNEL_MESSAGE_KINDS = [
  "user_text",
  "agent_text",
  "watch",
  "worker",
  "system",
  "media",
  "text",
  "other",
] as const;

export type ChannelMessageKind = typeof CHANNEL_MESSAGE_KINDS[number];

export interface ChannelMessageInspection {
  id: string;
  channel: string;
  timestamp: number;
  sender: ChannelMessage["sender"];
  origin: ChannelMessage["origin"];
  contentType: ChannelMessage["content"]["type"];
  preview: string;
  kind: ChannelMessageKind;
  sourceId?: string;
  targetChannel?: string;
  inspectCommands: string[];
}

interface ChannelActivitySummary {
  kindCounts: Record<ChannelMessageKind, number>;
  recentRequests: ChannelMessageInspection[];
  sourceRecords: ChannelMessageInspection[];
  inspectCommands: string[];
}

export interface ChannelSummary {
  channel: string;
  path: string;
  exists: boolean;
  messageCount: number;
  membership: ChannelMembership;
  lastMessage: ChannelMessageInspection | null;
  activity?: ChannelActivitySummary;
}

export interface ChannelSearchFilters {
  text?: string;
  kinds?: ChannelMessageKind[];
  senderKinds?: MessageSenderKind[];
  actorIds?: string[];
  transports?: string[];
  contentTypes?: string[];
  addressedAgentIds?: string[];
  watchIds?: string[];
  sourceKinds?: string[];
  limit?: number;
}

export interface ChannelSearchResult {
  channel: string;
  path: string;
  totalMessages: number;
  matchedCount: number;
  returnedCount: number;
  filters: ChannelSearchFilters & { limit: number };
  messages: ChannelMessageInspection[];
}

export function listChannelSummaries(
  runtime: AppRuntime,
  opts: { includeActivity?: boolean } = {},
): ChannelSummary[] {
  const memberships = runtime.createChannelMembershipStore();
  const names = listChannelNames(runtime.paths.channelsDir, memberships.listChannels());
  return names.map((channel) => summarizeChannel(runtime, channel, opts));
}

export function summarizeChannel(
  runtime: AppRuntime,
  channel: string,
  opts: { includeActivity?: boolean } = {},
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
    lastMessage: messages.length > 0
      ? inspectChannelMessage(channel, messages[messages.length - 1]!)
      : null,
    ...(opts.includeActivity === false
      ? {}
      : { activity: summarizeChannelActivity(channel, messages) }),
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

export function searchChannelMessages(
  runtime: AppRuntime,
  channel: string,
  filters: ChannelSearchFilters,
): ChannelSearchResult {
  const channelBus = runtime.createChannelBus();
  const path = channelBus.path(channel);
  if (!existsSync(path)) {
    throw new Error(`channel not found: ${channel}`);
  }

  const limit = filters.limit ?? 50;
  const { messages } = channelBus.read(channel);
  const inspected = messages.map((message) => inspectChannelMessage(channel, message));
  const matched = inspected.filter((message) =>
    matchesChannelSearch(message, filters)
  );
  const returned = matched.slice(-limit);

  return {
    channel,
    path,
    totalMessages: messages.length,
    matchedCount: matched.length,
    returnedCount: returned.length,
    filters: {
      ...filters,
      limit,
    },
    messages: returned,
  };
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

export function inspectChannelMessage(
  channel: string,
  message: ChannelMessage,
): ChannelMessageInspection {
  const kind = classifyChannelMessage(message);
  return {
    id: message.id,
    channel,
    timestamp: message.timestamp,
    sender: message.sender,
    origin: message.origin,
    contentType: message.content.type,
    preview: message.content.type === "text"
      ? clipText(message.content.data.text)
      : JSON.stringify(message.content.data),
    kind,
    sourceId: sourceRecordId(message, kind),
    targetChannel: sourceTargetChannel(message),
    inspectCommands: inspectCommandsForMessage(message, kind),
  };
}

function summarizeChannelActivity(
  channel: string,
  messages: ChannelMessage[],
): ChannelActivitySummary {
  const inspected = messages.map((message) => inspectChannelMessage(channel, message));
  const kindCounts = emptyKindCounts();
  for (const message of inspected) {
    kindCounts[message.kind] += 1;
  }

  const recentRequests = inspected
    .filter(isRequestLikeMessage)
    .slice(-5);
  const sourceRecords = recentSourceRecords(inspected, 8);
  const inspectCommands = uniqueStrings(
    sourceRecords.flatMap((record) => record.inspectCommands),
  );

  return {
    kindCounts,
    recentRequests,
    sourceRecords,
    inspectCommands,
  };
}

function classifyChannelMessage(message: ChannelMessage): ChannelMessageKind {
  if (isWatchMessage(message)) return "watch";
  if (isWorkerMessage(message)) return "worker";
  if (message.sender.kind === "human" && message.content.type === "text") {
    return "user_text";
  }
  if (message.sender.kind === "agent" && message.content.type === "text") {
    return "agent_text";
  }
  if (message.sender.kind === "system" || message.content.type === "system") {
    return "system";
  }
  if (
    message.content.type === "image" ||
    message.content.type === "image_group" ||
    message.content.type === "unsupported_media"
  ) {
    return "media";
  }
  if (message.content.type === "text") return "text";
  return "other";
}

function isWatchMessage(message: ChannelMessage): boolean {
  return message.origin.transport === "watch" ||
    Boolean(message.origin.watchId) ||
    Boolean(message.origin.watch) ||
    message.sender.actorId === "system:watch-runner";
}

function isWorkerMessage(message: ChannelMessage): boolean {
  const origin = message.origin as ChannelMessage["origin"] & Record<string, unknown>;
  const contentData = message.content.data as Record<string, unknown>;
  return message.origin.transport === "worker" ||
    origin.sourceKind === "worker" ||
    typeof origin.workerId === "string" ||
    message.sender.actorId.startsWith("worker:") ||
    (
      typeof contentData.kind === "string" &&
      contentData.kind.startsWith("worker")
    );
}

function sourceRecordId(
  message: ChannelMessage,
  kind: ChannelMessageKind,
): string | undefined {
  const origin = message.origin as ChannelMessage["origin"] & Record<string, unknown>;
  if (kind === "watch") return message.origin.watchId;
  if (kind === "worker") {
    return stringValue(origin.workerId) ?? stringValue(origin.sourceId);
  }
  return stringValue(origin.sourceId);
}

function sourceTargetChannel(message: ChannelMessage): string | undefined {
  return message.origin.watch?.targetChannel ??
    stringValue(originRecord(message).targetChannel);
}

function inspectCommandsForMessage(
  message: ChannelMessage,
  kind: ChannelMessageKind,
): string[] {
  const origin = message.origin as ChannelMessage["origin"] & Record<string, unknown>;
  const explicit = [
    ...arrayOfStrings(origin.inspect),
    ...arrayOfStrings(message.origin.watch?.inspect),
  ];
  if (explicit.length > 0) return uniqueStrings(explicit);

  const id = sourceRecordId(message, kind);
  if (kind === "watch" && id) return [`shrimpy watches show ${id}`];
  if (kind === "worker" && id) return [`shrimpy worker status ${id}`];
  return [];
}

function matchesChannelSearch(
  message: ChannelMessageInspection,
  filters: ChannelSearchFilters,
): boolean {
  if (filters.text && !searchableText(message).includes(filters.text.toLowerCase())) {
    return false;
  }
  if (!matchesAny(message.kind, filters.kinds)) return false;
  if (!matchesAny(message.sender.kind, filters.senderKinds)) return false;
  if (!matchesAny(message.sender.actorId, filters.actorIds)) return false;
  if (!matchesAny(message.origin.transport, filters.transports)) return false;
  if (!matchesAny(message.contentType, filters.contentTypes)) return false;
  if (!matchesAny(message.origin.addressedAgentId ?? "none", filters.addressedAgentIds)) {
    return false;
  }
  if (!matchesAny(message.origin.watchId ?? "none", filters.watchIds)) {
    return false;
  }
  if (
    filters.sourceKinds &&
    filters.sourceKinds.length > 0 &&
    !matchesAny(message.kind, filters.sourceKinds) &&
    !matchesAny(
      stringValue(originRecord(message).sourceKind),
      filters.sourceKinds,
    )
  ) {
    return false;
  }
  return true;
}

function searchableText(message: ChannelMessageInspection): string {
  return [
    message.id,
    message.channel,
    message.kind,
    message.sender.kind,
    message.sender.actorId,
    message.sender.userId,
    message.sender.displayName,
    message.origin.transport,
    message.origin.transportUserId,
    message.origin.transportChatId,
    message.origin.addressedAgentId,
    message.origin.watchId,
    message.origin.runId,
    message.sourceId,
    message.targetChannel,
    message.inspectCommands.join(" "),
    message.preview,
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .toLowerCase();
}

function isRequestLikeMessage(message: ChannelMessageInspection): boolean {
  return message.kind === "user_text" ||
    message.kind === "worker";
}

function recentSourceRecords(
  messages: ChannelMessageInspection[],
  limit: number,
): ChannelMessageInspection[] {
  const records: ChannelMessageInspection[] = [];
  const seen = new Set<string>();

  for (const message of [...messages].reverse()) {
    if (
      message.kind !== "watch" &&
      message.kind !== "worker"
    ) continue;
    const id = message.sourceId;
    if (!id) continue;
    const key = `${message.kind}:${id}:${message.origin.runId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push(message);
    if (records.length >= limit) break;
  }

  return records;
}

function emptyKindCounts(): Record<ChannelMessageKind, number> {
  return Object.fromEntries(
    CHANNEL_MESSAGE_KINDS.map((kind) => [kind, 0]),
  ) as Record<ChannelMessageKind, number>;
}

function matchesAny(
  value: string | undefined,
  expected: readonly string[] | undefined,
): boolean {
  if (!expected || expected.length === 0) return true;
  if (value === undefined) return false;
  const normalized = value.toLowerCase();
  return expected.some((item) => item.toLowerCase() === normalized);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function originRecord(message: Pick<ChannelMessageInspection, "origin">): Record<string, unknown> {
  return message.origin as unknown as Record<string, unknown>;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
