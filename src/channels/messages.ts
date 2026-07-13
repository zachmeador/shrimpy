import {
  isThinkingLevel,
  type ThinkingLevel,
} from "../thinking.js";
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

export type SessionStopContentData = Record<string, unknown> & {
  kind: "session_stop";
  targetAgentId: string;
  command?: string;
};

export type SessionControlContentData =
  | SessionResetContentData
  | SessionRestoreContentData
  | SessionThinkingLevelContentData
  | SessionStopContentData;

export type SurfaceAddressingStatusContentData = Record<string, unknown> & {
  kind: "surface_addressing";
  surface: string;
  threadId: string;
  previousAgentId: string | null;
  addressedAgentId: string | null;
  joinedAgentId: string | null;
  source: "chat" | "cli";
};

export type OperationStatusContentData = Record<string, unknown> & {
  kind: "operation_status";
  text: string;
  ok: boolean;
  targetAgentId?: string;
  operation?: string;
  requestMessageId?: string;
  archiveName?: string;
};

export type StatusContentData =
  | SurfaceAddressingStatusContentData
  | OperationStatusContentData;

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

export interface ControlMessageContent<
  T extends SessionControlContentData = SessionControlContentData,
> {
  type: "control";
  data: T;
}

export interface StatusMessageContent<
  T extends StatusContentData = StatusContentData,
> {
  type: "status";
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
  | ControlMessageContent
  | StatusMessageContent
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

export function controlContent<T extends SessionControlContentData>(
  data: T,
): ControlMessageContent<T> {
  return {
    type: "control",
    data,
  };
}

export function statusContent<T extends StatusContentData>(
  data: T,
): StatusMessageContent<T> {
  return {
    type: "status",
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

export function isControlMessageContent(
  value: unknown,
): value is ControlMessageContent {
  return isRecord(value)
    && value.type === "control"
    && isSessionControlContentData(value.data);
}

export function isStatusMessageContent(
  value: unknown,
): value is StatusMessageContent {
  return isRecord(value)
    && value.type === "status"
    && isStatusContentData(value.data);
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

function isSessionStopContentData(
  value: unknown,
): value is SessionStopContentData {
  return isRecord(value)
    && value.kind === "session_stop"
    && typeof value.targetAgentId === "string"
    && (
      value.command === undefined
      || typeof value.command === "string"
    );
}

function isSessionControlContentData(
  value: unknown,
): value is SessionControlContentData {
  return isSessionResetContentData(value)
    || isSessionRestoreContentData(value)
    || isSessionThinkingLevelContentData(value)
    || isSessionStopContentData(value);
}

function isSurfaceAddressingStatusContentData(
  value: unknown,
): value is SurfaceAddressingStatusContentData {
  return isRecord(value)
    && value.kind === "surface_addressing"
    && typeof value.surface === "string"
    && typeof value.threadId === "string"
    && (
      value.previousAgentId === null
      || typeof value.previousAgentId === "string"
    )
    && (
      value.addressedAgentId === null
      || typeof value.addressedAgentId === "string"
    )
    && (
      value.joinedAgentId === null
      || typeof value.joinedAgentId === "string"
    )
    && (
      value.source === "chat"
      || value.source === "cli"
    );
}

function isStatusContentData(
  value: unknown,
): value is StatusContentData {
  return isSurfaceAddressingStatusContentData(value)
    || isOperationStatusContentData(value);
}

function isOperationStatusContentData(
  value: unknown,
): value is OperationStatusContentData {
  return isRecord(value)
    && value.kind === "operation_status"
    && typeof value.text === "string"
    && typeof value.ok === "boolean"
    && (
      value.targetAgentId === undefined ||
      typeof value.targetAgentId === "string"
    )
    && (
      value.operation === undefined ||
      typeof value.operation === "string"
    )
    && (
      value.requestMessageId === undefined ||
      typeof value.requestMessageId === "string"
    )
    && (
      value.archiveName === undefined ||
      typeof value.archiveName === "string"
    );
}

export function sessionResetContent(
  targetAgentId: string,
  command?: string,
): ControlMessageContent<SessionResetContentData> {
  return controlContent({
    kind: "session_reset",
    targetAgentId,
    ...(command ? { command } : {}),
  } as SessionResetContentData);
}

export function sessionRestoreContent(
  targetAgentId: string,
  archiveName?: string,
  command?: string,
): ControlMessageContent<SessionRestoreContentData> {
  return controlContent({
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
): ControlMessageContent<SessionThinkingLevelContentData> {
  return controlContent({
    kind: "session_thinking_level",
    targetAgentId,
    level,
    ...(command ? { command } : {}),
  } as SessionThinkingLevelContentData);
}

export function sessionStopContent(
  targetAgentId: string,
  command?: string,
): ControlMessageContent<SessionStopContentData> {
  return controlContent({
    kind: "session_stop",
    targetAgentId,
    ...(command ? { command } : {}),
  } as SessionStopContentData);
}

export function surfaceAddressingStatusContent(input: {
  surface: string;
  threadId: string;
  previousAgentId?: string | null;
  addressedAgentId?: string | null;
  joinedAgentId?: string | null;
  source: "chat" | "cli";
}): StatusMessageContent<SurfaceAddressingStatusContentData> {
  return statusContent({
    kind: "surface_addressing",
    surface: input.surface,
    threadId: input.threadId,
    previousAgentId: input.previousAgentId ?? null,
    addressedAgentId: input.addressedAgentId ?? null,
    joinedAgentId: input.joinedAgentId ?? null,
    source: input.source,
  } as SurfaceAddressingStatusContentData);
}

export function operationStatusContent(input: {
  text: string;
  ok: boolean;
  targetAgentId?: string;
  operation?: string;
  requestMessageId?: string;
  archiveName?: string;
}): StatusMessageContent<OperationStatusContentData> {
  return statusContent({
    kind: "operation_status",
    text: input.text,
    ok: input.ok,
    ...(input.targetAgentId ? { targetAgentId: input.targetAgentId } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.requestMessageId ? { requestMessageId: input.requestMessageId } : {}),
    ...(input.archiveName ? { archiveName: input.archiveName } : {}),
  } as OperationStatusContentData);
}

export function readOperationStatusContent(
  value: MessageContent,
): OperationStatusContentData | null {
  if (!isStatusMessageContent(value)) return null;
  return isOperationStatusContentData(value.data) ? value.data : null;
}

export function readSessionControlContent(
  value: MessageContent,
): SessionControlContentData | null {
  return isControlMessageContent(value) ? value.data : null;
}

export function readSessionResetContent(
  value: MessageContent,
): SessionResetContentData | null {
  if (!isControlMessageContent(value)) return null;
  return isSessionResetContentData(value.data) ? value.data : null;
}

export function readSessionRestoreContent(
  value: MessageContent,
): SessionRestoreContentData | null {
  if (!isControlMessageContent(value)) return null;
  return isSessionRestoreContentData(value.data) ? value.data : null;
}

export function readSessionThinkingLevelContent(
  value: MessageContent,
): SessionThinkingLevelContentData | null {
  if (!isControlMessageContent(value)) return null;
  return isSessionThinkingLevelContentData(value.data) ? value.data : null;
}

export function readSessionStopContent(
  value: MessageContent,
): SessionStopContentData | null {
  if (!isControlMessageContent(value)) return null;
  return isSessionStopContentData(value.data) ? value.data : null;
}

export function isMessageContent(value: unknown): value is MessageContent {
  return isTextMessageContent(value)
    || isImageMessageContent(value)
    || isImageGroupMessageContent(value)
    || isUnsupportedMediaMessageContent(value)
    || isControlMessageContent(value)
    || isStatusMessageContent(value)
    || isSystemMessageContent(value);
}
