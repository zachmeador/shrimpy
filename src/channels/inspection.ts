import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelMessage, MessageSenderKind } from "./protocol.js";
import {
  clipChannelMessageBody,
  formatChannelMessageBody,
} from "./format.js";
import type { ChannelManifest } from "./manifest.js";
import {
  type ChannelMembership,
} from "./membership.js";
import {
  readDeliveryReceipts,
  summarizeDeliveryReceipts,
  type DeliveryReceipt,
} from "./outbox.js";

export const CHANNEL_MESSAGE_KINDS = [
  "user_text",
  "agent_text",
  "watch",
  "control",
  "status",
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

interface ChannelMessageActivitySummary {
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
  manifest: ChannelManifest;
  deliveries: {
    delivered: number;
    failed: number;
    retrying: number;
    skipped: number;
    undelivered: number;
    lastReceipt?: DeliveryReceipt;
  };
  lastMessage: ChannelMessageInspection | null;
  activity?: ChannelMessageActivitySummary;
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

interface ChannelMessageInspectionOptions {
  fullPreview?: boolean;
  previewChars?: number;
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
  const manifest = memberships.getManifest(channel);
  const deliveries = summarizeDeliveryReceipts(
    readDeliveryReceipts(runtime.paths.outboundReceiptsPath),
    channel,
  );

  return {
    channel,
    path,
    exists,
    messageCount: messages.length,
    membership,
    manifest,
    deliveries,
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
  opts: ChannelMessageInspectionOptions = {},
): ChannelSearchResult {
  const channelBus = runtime.createChannelBus();
  const path = channelBus.path(channel);
  if (!existsSync(path)) {
    throw new Error(`channel not found: ${channel}`);
  }

  const limit = filters.limit ?? 50;
  const { messages } = channelBus.read(channel);
  const inspected = messages.map((message) =>
    inspectChannelMessage(channel, message, opts)
  );
  const matched = inspected.filter((message, index) =>
    matchesChannelSearch(message, filters, messages[index])
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

export function inspectChannelMessage(
  channel: string,
  message: ChannelMessage,
  opts: ChannelMessageInspectionOptions = {},
): ChannelMessageInspection {
  const kind = classifyChannelMessage(message);
  const preview = formatChannelMessagePreview(message, opts);
  return {
    id: message.id,
    channel,
    timestamp: message.timestamp,
    sender: message.sender,
    origin: message.origin,
    contentType: message.content.type,
    preview,
    kind,
    sourceId: sourceRecordId(message, kind),
    targetChannel: sourceTargetChannel(message),
    inspectCommands: inspectCommandsForMessage(message, kind),
  };
}

function formatChannelMessagePreview(
  message: ChannelMessage,
  opts: ChannelMessageInspectionOptions,
): string {
  const body = formatChannelMessageBody(message.content);
  return opts.fullPreview
    ? body
    : clipChannelMessageBody(body, opts.previewChars ?? 120);
}

function summarizeChannelActivity(
  channel: string,
  messages: ChannelMessage[],
): ChannelMessageActivitySummary {
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

export function classifyChannelMessage(message: ChannelMessage): ChannelMessageKind {
  if (message.content.type === "control") return "control";
  if (message.content.type === "status") return "status";
  if (isWatchMessage(message)) return "watch";
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

function sourceRecordId(
  message: ChannelMessage,
  kind: ChannelMessageKind,
): string | undefined {
  const origin = message.origin as ChannelMessage["origin"] & Record<string, unknown>;
  if (kind === "watch") return message.origin.watchId;
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
  return [];
}

function matchesChannelSearch(
  message: ChannelMessageInspection,
  filters: ChannelSearchFilters,
  source?: ChannelMessage,
): boolean {
  if (filters.text && !searchableText(message, source).includes(filters.text.toLowerCase())) {
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

function searchableText(
  message: ChannelMessageInspection,
  source?: ChannelMessage,
): string {
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
    source ? formatChannelMessageBody(source.content) : message.preview,
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .toLowerCase();
}

function isRequestLikeMessage(message: ChannelMessageInspection): boolean {
  return message.kind === "user_text";
}

function recentSourceRecords(
  messages: ChannelMessageInspection[],
  limit: number,
): ChannelMessageInspection[] {
  const records: ChannelMessageInspection[] = [];
  const seen = new Set<string>();

  for (const message of [...messages].reverse()) {
    if (
      message.kind !== "watch"
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
