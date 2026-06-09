import {
  isThinkingLevel,
  type ThinkingLevel,
} from "../inference/thinking.js";
import { isRecord } from "../util/record.js";

export type SessionResetContentData = Record<string, unknown> & {
  kind: "session_reset";
  targetAgentId: string;
  command?: string;
};

export type SessionRestoreContentData = Record<string, unknown> & {
  kind: "session_restore";
  targetAgentId: string;
  archiveName?: string;
  command?: string;
};

export type SessionThinkingLevelContentData = Record<string, unknown> & {
  kind: "session_thinking_level";
  targetAgentId: string;
  level: ThinkingLevel;
  command?: string;
};

export interface TextMessageContent {
  type: "text";
  data: {
    text: string;
    publication?: PublicationIntent;
  };
}

export type PublicationIntentKind = "reply" | "ask" | "notify" | "report";
export type PublicationUrgency = "low" | "normal" | "high";

export interface PublicationIntent {
  kind: PublicationIntentKind;
  urgency?: PublicationUrgency;
  quiet?: boolean;
  batchable?: boolean;
}

export interface ImageMessageContent {
  type: "image";
  data: {
    path: string;
    caption?: string;
  };
}

export interface ImageGroupMessageContent {
  type: "image_group";
  data: {
    paths: string[];
    caption?: string;
  };
}

export interface SystemMessageContent<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  type: "system";
  data: T;
}

export type UnsupportedMediaKind =
  | "document"
  | "voice"
  | "audio"
  | "video"
  | "animation"
  | "sticker"
  | "photo"
  | "photo_group"
  | "location"
  | "contact"
  | "other";

export interface UnsupportedSurfaceMessage {
  mediaKind: UnsupportedMediaKind;
  caption?: string;
  fileName?: string;
  latitude?: number;
  longitude?: number;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

export interface UnsupportedMediaMessageContent {
  type: "unsupported_media";
  data: UnsupportedSurfaceMessage;
}

export type MessageContent =
  | TextMessageContent
  | ImageMessageContent
  | ImageGroupMessageContent
  | UnsupportedMediaMessageContent
  | SystemMessageContent;

export function textContent(
  text: string,
  publication?: PublicationIntent,
): TextMessageContent {
  return {
    type: "text",
    data: publication ? { text, publication } : { text },
  };
}

export function imageContent(
  path: string,
  caption?: string,
): ImageMessageContent {
  return {
    type: "image",
    data: caption === undefined ? { path } : { path, caption },
  };
}

export function imageGroupContent(
  paths: string[],
  caption?: string,
): ImageGroupMessageContent {
  if (paths.length === 0) {
    throw new Error("image_group requires at least one path");
  }
  return {
    type: "image_group",
    data: caption === undefined ? { paths: [...paths] } : { paths: [...paths], caption },
  };
}

export function systemContent<T extends Record<string, unknown>>(
  data: T,
): SystemMessageContent<T> {
  return {
    type: "system",
    data,
  };
}

export function unsupportedMediaContent(
  data: UnsupportedSurfaceMessage,
): UnsupportedMediaMessageContent {
  return {
    type: "unsupported_media",
    data,
  };
}

export function isTextMessageContent(
  value: unknown,
): value is TextMessageContent {
  return isRecord(value)
    && value.type === "text"
    && isRecord(value.data)
    && typeof value.data.text === "string"
    && (
      value.data.publication === undefined
      || isPublicationIntent(value.data.publication)
    );
}

export function isPublicationIntent(value: unknown): value is PublicationIntent {
  return isRecord(value)
    && isPublicationIntentKind(value.kind)
    && (
      value.urgency === undefined
      || isPublicationUrgency(value.urgency)
    )
    && (
      value.quiet === undefined
      || typeof value.quiet === "boolean"
    )
    && (
      value.batchable === undefined
      || typeof value.batchable === "boolean"
    );
}

function isPublicationIntentKind(value: unknown): value is PublicationIntentKind {
  return value === "reply"
    || value === "ask"
    || value === "notify"
    || value === "report";
}

function isPublicationUrgency(value: unknown): value is PublicationUrgency {
  return value === "low" || value === "normal" || value === "high";
}

export function isImageMessageContent(
  value: unknown,
): value is ImageMessageContent {
  return isRecord(value)
    && value.type === "image"
    && isRecord(value.data)
    && typeof value.data.path === "string"
    && (
      value.data.caption === undefined
      || typeof value.data.caption === "string"
    );
}

export function isImageGroupMessageContent(
  value: unknown,
): value is ImageGroupMessageContent {
  return isRecord(value)
    && value.type === "image_group"
    && isRecord(value.data)
    && Array.isArray(value.data.paths)
    && value.data.paths.length > 0
    && value.data.paths.every((path) => typeof path === "string")
    && (
      value.data.caption === undefined
      || typeof value.data.caption === "string"
    );
}

export function isSystemMessageContent(
  value: unknown,
): value is SystemMessageContent {
  return isRecord(value)
    && value.type === "system"
    && isRecord(value.data);
}

export function isUnsupportedMediaMessageContent(
  value: unknown,
): value is UnsupportedMediaMessageContent {
  return isRecord(value)
    && value.type === "unsupported_media"
    && isRecord(value.data)
    && typeof value.data.mediaKind === "string";
}

function isSessionResetContentData(
  value: unknown,
): value is SessionResetContentData {
  return isRecord(value)
    && value.kind === "session_reset"
    && typeof value.targetAgentId === "string"
    && (
      value.command === undefined
      || typeof value.command === "string"
    );
}

function isSessionRestoreContentData(
  value: unknown,
): value is SessionRestoreContentData {
  return isRecord(value)
    && value.kind === "session_restore"
    && typeof value.targetAgentId === "string"
    && (
      value.archiveName === undefined
      || typeof value.archiveName === "string"
    )
    && (
      value.command === undefined
      || typeof value.command === "string"
    );
}

function isSessionThinkingLevelContentData(
  value: unknown,
): value is SessionThinkingLevelContentData {
  return isRecord(value)
    && value.kind === "session_thinking_level"
    && typeof value.targetAgentId === "string"
    && isThinkingLevel(value.level)
    && (
      value.command === undefined
      || typeof value.command === "string"
    );
}

export function sessionResetContent(
  targetAgentId: string,
  command?: string,
): SystemMessageContent<SessionResetContentData> {
  return systemContent({
    kind: "session_reset",
    targetAgentId,
    ...(command ? { command } : {}),
  } as SessionResetContentData);
}

export function sessionRestoreContent(
  targetAgentId: string,
  archiveName?: string,
  command?: string,
): SystemMessageContent<SessionRestoreContentData> {
  return systemContent({
    kind: "session_restore",
    targetAgentId,
    ...(archiveName ? { archiveName } : {}),
    ...(command ? { command } : {}),
  } as SessionRestoreContentData);
}

export function sessionThinkingLevelContent(
  targetAgentId: string,
  level: ThinkingLevel,
  command?: string,
): SystemMessageContent<SessionThinkingLevelContentData> {
  return systemContent({
    kind: "session_thinking_level",
    targetAgentId,
    level,
    ...(command ? { command } : {}),
  } as SessionThinkingLevelContentData);
}

export function readSessionResetContent(
  value: MessageContent,
): SessionResetContentData | null {
  if (!isSystemMessageContent(value)) return null;
  return isSessionResetContentData(value.data) ? value.data : null;
}

export function readSessionRestoreContent(
  value: MessageContent,
): SessionRestoreContentData | null {
  if (!isSystemMessageContent(value)) return null;
  return isSessionRestoreContentData(value.data) ? value.data : null;
}

export function readSessionThinkingLevelContent(
  value: MessageContent,
): SessionThinkingLevelContentData | null {
  if (!isSystemMessageContent(value)) return null;
  return isSessionThinkingLevelContentData(value.data) ? value.data : null;
}

export function isMessageContent(value: unknown): value is MessageContent {
  return isTextMessageContent(value)
    || isImageMessageContent(value)
    || isImageGroupMessageContent(value)
    || isUnsupportedMediaMessageContent(value)
    || isSystemMessageContent(value);
}
