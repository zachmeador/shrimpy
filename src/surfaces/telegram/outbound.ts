import { outboundTextForMessage, publicationIntentForMessage } from "../../channels/outbox.js";
import type { ChannelMessage } from "../../channels/protocol.js";
import type { PublicationIntent } from "../../channels/messages.js";
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
      const text = outboundTextForMessage(message);
      if (text) {
        await sendTelegramPublicationText(telegram, chatId, text, publication);
      }
    }
  }
}

function shouldDisableTelegramNotification(
  publication?: PublicationIntent,
): boolean {
  return publication?.quiet === true
    || (publication?.kind === "notify" && publication.urgency === "low");
}
