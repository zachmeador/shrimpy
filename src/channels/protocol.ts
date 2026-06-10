import type { ThinkingLevel } from "../inference/thinking.js";
import { isRecord } from "../util/record.js";
import {
  imageContent,
  imageGroupContent,
  isMessageContent,
  sessionResetContent,
  sessionRestoreContent,
  sessionStopContent,
  sessionThinkingLevelContent,
  systemContent,
  textContent,
  unsupportedMediaContent,
  type MessageContent,
  type PublicationIntent,
  type UnsupportedSurfaceMessage,
} from "./messages.js";

export interface ChannelMessage {
  id: string;
  sender: MessageSender;
  origin: MessageOrigin;
  content: MessageContent;
  timestamp: number;
}

export type MessageSenderKind = "human" | "agent" | "system";

export interface MessageSender {
  /**
   * Actor class for coarse routing. "human" means a human-facing surface
   * produced the message; it does not imply a single owner/user.
   */
  kind: MessageSenderKind;
  /**
   * Stable Shrimpy actor id, independent of the transport account/thread.
   * Human transport ids live on origin.transportUserId.
   */
  actorId: string;
  userId?: string;
  displayName?: string;
}

export interface MessageOrigin {
  /**
   * Free-form transport identifier stamped by the producing surface.
   * Built-in producers use "cli", "watch", "internal"; surface modules
   * stamp their own (e.g. "telegram"). Channel-protocol consumers should
   * not switch on specific values.
   */
  transport: string;
  transportUserId?: string;
  transportChatId?: string;
  addressedAgentId?: string;
  watchId?: string;
  runId?: string;
  sourceKind?: string;
  sourceId?: string;
  workerId?: string;
  sourceChannel?: string;
  watch?: MessageWatchProvenance;
}

export interface MessageWatchProvenance {
  kind?: "recurring" | "manual";
  ownerAgentId?: string;
  localId?: string;
  targetChannel?: string;
  trigger?: Record<string, unknown>;
  actionKind?: string;
  inspect?: string[];
}

export interface PublishChannelMessageInput {
  channel: string;
  sender: MessageSender;
  origin: MessageOrigin;
  content: MessageContent;
  timestamp?: number;
  id?: string;
}

interface PublishHumanBaseInput {
  channel: string;
  actorId: string;
  userId?: string;
  displayName?: string;
  transport: string;
  addressedAgentId?: string;
  sourceChannel?: string;
  transportUserId?: string;
  transportChatId?: string;
}

export interface PublishHumanTextInput extends PublishHumanBaseInput {
  text: string;
}

export interface PublishAgentTextInput {
  channel: string;
  text: string;
  actorId: string;
  sourceChannel?: string;
  publication?: PublicationIntent;
}

export interface PublishHumanImageInput extends PublishHumanBaseInput {
  path: string;
  caption?: string;
}

export interface PublishHumanImageGroupInput extends PublishHumanBaseInput {
  paths: string[];
  caption?: string;
}

export interface PublishHumanUnsupportedMediaInput extends PublishHumanBaseInput {
  media: UnsupportedSurfaceMessage;
}

interface PublishSessionControlInput {
  channel: string;
  targetAgentId: string;
  sender: MessageSender;
  origin: MessageOrigin;
  command?: string;
  timestamp?: number;
  id?: string;
}

type PublishSessionResetInput = PublishSessionControlInput;

interface PublishSessionRestoreInput extends PublishSessionControlInput {
  archiveName?: string;
}

interface PublishSessionThinkingLevelInput extends PublishSessionControlInput {
  level: ThinkingLevel;
}

type PublishSessionStopInput = PublishSessionControlInput;

export interface PublishSystemInput {
  channel: string;
  actorId: string;
  transport: string;
  data: Record<string, unknown>;
  userId?: string;
  displayName?: string;
  sourceChannel?: string;
  transportUserId?: string;
  transportChatId?: string;
  addressedAgentId?: string;
  timestamp?: number;
  id?: string;
}

export function isChannelMessage(value: unknown): value is ChannelMessage {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (!isRecord(value.sender) || typeof value.sender.actorId !== "string") {
    return false;
  }
  if (
    value.sender.kind !== "human" &&
    value.sender.kind !== "agent" &&
    value.sender.kind !== "system"
  ) {
    return false;
  }
  if (!isRecord(value.origin) || typeof value.origin.transport !== "string") {
    return false;
  }
  if (!isMessageContent(value.content)) return false;
  return typeof value.timestamp === "number";
}

export function makeMessage(
  opts: {
    sender: MessageSender;
    origin: MessageOrigin;
    content: MessageContent;
    timestamp?: number;
    id?: string;
  },
): ChannelMessage {
  return {
    id: opts.id ?? crypto.randomUUID(),
    sender: opts.sender,
    origin: opts.origin,
    content: opts.content,
    timestamp: opts.timestamp ?? Date.now(),
  };
}

export function humanTextMessageInput(
  input: PublishHumanTextInput,
): PublishChannelMessageInput {
  return humanMessageInput(input, textContent(input.text));
}

export function agentTextMessageInput(
  input: PublishAgentTextInput,
): PublishChannelMessageInput {
  return {
    channel: input.channel,
    sender: {
      kind: "agent",
      actorId: input.actorId,
    },
    origin: {
      transport: "internal",
      sourceChannel: input.sourceChannel ?? input.channel,
    },
    content: textContent(input.text, input.publication),
  };
}

export function humanImageMessageInput(
  input: PublishHumanImageInput,
): PublishChannelMessageInput {
  return humanMessageInput(input, imageContent(input.path, input.caption));
}

export function humanImageGroupMessageInput(
  input: PublishHumanImageGroupInput,
): PublishChannelMessageInput {
  return humanMessageInput(input, imageGroupContent(input.paths, input.caption));
}

export function humanUnsupportedMediaMessageInput(
  input: PublishHumanUnsupportedMediaInput,
): PublishChannelMessageInput {
  return humanMessageInput(input, unsupportedMediaContent(input.media));
}

function humanMessageInput(
  input: PublishHumanBaseInput,
  content: MessageContent,
): PublishChannelMessageInput {
  return {
    channel: input.channel,
    sender: {
      kind: "human",
      actorId: input.actorId,
      userId: input.userId,
      displayName: input.displayName,
    },
    origin: {
      transport: input.transport,
      sourceChannel: input.sourceChannel ?? input.channel,
      transportUserId: input.transportUserId,
      transportChatId: input.transportChatId,
      addressedAgentId: input.addressedAgentId,
    },
    content,
  };
}

export function sessionResetMessageInput(
  input: PublishSessionResetInput,
): PublishChannelMessageInput {
  return {
    channel: input.channel,
    sender: input.sender,
    origin: input.origin,
    content: sessionResetContent(input.targetAgentId, input.command),
    timestamp: input.timestamp,
    id: input.id,
  };
}

export function sessionRestoreMessageInput(
  input: PublishSessionRestoreInput,
): PublishChannelMessageInput {
  return {
    channel: input.channel,
    sender: input.sender,
    origin: input.origin,
    content: sessionRestoreContent(
      input.targetAgentId,
      input.archiveName,
      input.command,
    ),
    timestamp: input.timestamp,
    id: input.id,
  };
}

export function sessionThinkingLevelMessageInput(
  input: PublishSessionThinkingLevelInput,
): PublishChannelMessageInput {
  return {
    channel: input.channel,
    sender: input.sender,
    origin: input.origin,
    content: sessionThinkingLevelContent(
      input.targetAgentId,
      input.level,
      input.command,
    ),
    timestamp: input.timestamp,
    id: input.id,
  };
}

export function sessionStopMessageInput(
  input: PublishSessionStopInput,
): PublishChannelMessageInput {
  return {
    channel: input.channel,
    sender: input.sender,
    origin: input.origin,
    content: sessionStopContent(input.targetAgentId, input.command),
    timestamp: input.timestamp,
    id: input.id,
  };
}

export function systemMessageInput(input: PublishSystemInput): PublishChannelMessageInput {
  return {
    channel: input.channel,
    sender: {
      kind: "system",
      actorId: input.actorId,
      userId: input.userId,
      displayName: input.displayName,
    },
    origin: {
      transport: input.transport,
      sourceChannel: input.sourceChannel ?? input.channel,
      transportUserId: input.transportUserId,
      transportChatId: input.transportChatId,
      addressedAgentId: input.addressedAgentId,
    },
    content: systemContent(input.data),
    timestamp: input.timestamp,
    id: input.id,
  };
}
