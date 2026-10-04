import { outboundTextForMessage, publicationIntentForMessage } from "../../channels/outbox.js";
import type { ChannelMessage } from "../../channels/protocol.js";
import {
  readOperationStatusContent,
  type OperationStatusContentData,
  type PublicationIntent,
} from "../../channels/messages.js";
import type {
  TelegramSendMessageOptions,
  TelegramSendPhotoOptions,
} from "./client.js";
import {
  renderTelegramTextChunks,
  splitPlainTextChunks,
  TELEGRAM_TEXT_CHUNK_LIMIT,
  type TelegramTextChunk,
} from "./format.js";

export interface TelegramFormattedTextOptions {
  disableNotification?: boolean;
}

type TelegramTextSender = Pick<{
  sendMessage(
    chatId: number,
    text: string,
    parseModeOrOptions?: string | TelegramSendMessageOptions,
  ): Promise<void>;
}, "sendMessage">;

type TelegramMessageSender = TelegramTextSender & Pick<{
  sendPhoto(
    chatId: number,
    photo: string,
    options?: TelegramSendPhotoOptions,
  ): Promise<void>;
}, "sendPhoto">;

const OPERATION_STATUS_LABELS: Readonly<Record<string, string>> = {
  compaction: "Compaction",
  reset: "Session reset",
  restore: "Session restore",
  set: "Session settings",
  thinking: "Thinking level",
  stop: "Session stop",
};

export async function sendTelegramFormattedText(
  telegram: TelegramTextSender,
  chatId: number,
  text: string,
  options?: TelegramFormattedTextOptions,
): Promise<void> {
  for (const chunk of renderTelegramTextChunks(text)) {
    try {
      await telegram.sendMessage(
        chatId,
        chunk.text,
        telegramSendOptions(chunk, options),
      );
    } catch (err) {
      if (!chunk.parseMode) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[telegram] formatted send failed, retrying as plain text:", message);
      for (const plainChunk of splitPlainTextChunks(text.trim(), TELEGRAM_TEXT_CHUNK_LIMIT)) {
        const plainText = plainChunk.trim();
        if (plainText) {
          await telegram.sendMessage(
            chatId,
            plainText,
            telegramSendOptions({}, options),
          );
        }
      }
      return;
    }
  }
}

function telegramSendOptions(
  chunk: Pick<TelegramTextChunk, "parseMode">,
  options?: TelegramFormattedTextOptions,
): string | TelegramSendMessageOptions | undefined {
  if (!options?.disableNotification) return chunk.parseMode;
  return {
    parseMode: chunk.parseMode,
    disableNotification: true,
  };
}

export async function sendTelegramPublicationText(
  telegram: TelegramTextSender,
  chatId: number,
  text: string,
  publication?: PublicationIntent,
): Promise<void> {
  await sendTelegramFormattedText(
    telegram,
    chatId,
    text,
    {
      disableNotification: shouldDisableTelegramNotification(publication),
    },
  );
}

export async function sendTelegramChannelMessage(
  telegram: TelegramMessageSender,
  chatId: number,
  message: ChannelMessage,
  defaultAgentId: string,
): Promise<void> {
  const publication = publicationIntentForMessage(message);
  const disableNotification = shouldDisableTelegramNotification(publication);
  switch (message.content.type) {
    case "image":
      await telegram.sendPhoto(chatId, message.content.data.path, {
        caption: message.content.data.caption,
        disableNotification,
      });
      return;
    case "image_group":
      for (const [index, path] of message.content.data.paths.entries()) {
        await telegram.sendPhoto(chatId, path, {
          caption: index === 0 ? message.content.data.caption : undefined,
          disableNotification,
        });
      }
      return;
    default: {
      const text = telegramOutboundTextForMessage(message, defaultAgentId);
      if (text) {
        await sendTelegramPublicationText(telegram, chatId, text, publication);
      }
    }
  }
}

export function telegramOutboundTextForMessage(
  message: ChannelMessage,
  defaultAgentId: string,
): string | null {
  const text = outboundTextForMessage(message);
  if (!text) return null;

  const operationStatus = readOperationStatusContent(message.content);
  if (operationStatus) {
    return telegramNoticeText(
      operationStatus.ok ? "✅" : "⚠️",
      operationStatusLabel(operationStatus),
      text,
    );
  }

  if (message.sender.kind !== "agent") return text;
  if (message.sender.actorId === `agent:${defaultAgentId}`) return text;

  const label = (message.sender.displayName?.trim() ?? "") || message.sender.actorId;
  return telegramNoticeText("📨", `Message from ${label}`, text);
}

function telegramNoticeText(icon: string, label: string, text: string): string {
  return `${icon} **${escapeMarkdownInline(label)}**\n\n${text}`;
}

function operationStatusLabel(status: OperationStatusContentData): string {
  const operation = status.operation?.trim();
  const subject = operation
    ? `${formatOperationName(operation)} status`
    : "Operation status";
  const targetAgentId = status.targetAgentId?.trim();
  return targetAgentId ? `${subject} for ${targetAgentId}` : subject;
}

function formatOperationName(operation: string): string {
  const knownLabel = OPERATION_STATUS_LABELS[operation];
  if (knownLabel) return knownLabel;
  const words = operation.replaceAll(/[-_]+/g, " ").trim();
  return words
    ? `${words[0]!.toUpperCase()}${words.slice(1)}`
    : "Operation";
}

function escapeMarkdownInline(text: string): string {
  return text
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "\\`")
    .replaceAll("*", "\\*")
    .replaceAll("_", "\\_")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]");
}

function shouldDisableTelegramNotification(
  publication?: PublicationIntent,
): boolean {
  return publication?.quiet === true
    || (publication?.kind === "notify" && publication.urgency === "low");
}
