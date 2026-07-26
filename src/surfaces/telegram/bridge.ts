/**
 * Telegram channel bridge.
 *
 * Translates Telegram updates into the typed channel protocol, owns
 * media persistence, batches text bursts and media groups, and
 * dispatches commands. Uses the Bot API client for media downloads
 * but knows nothing about long-polling transport.
 */

import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChannelBus } from "../../channels/bus.js";
import type { ChannelMembershipStore } from "../../channels/membership.js";
import type { UnsupportedSurfaceMessage } from "../../channels/messages.js";
import type { IdentityStore } from "../../gateway/identity-store.js";
import {
  ChatSurfacePublisher,
  PendingByThread,
  mergeChatTextBurst,
  type ChatHumanMessageBase,
} from "../shared/chat-bridge.js";
import type { SurfaceThreadStateStore } from "../shared/thread-state-store.js";
import type { UserPresenceStore } from "../shared/user-presence.js";
import type {
  TelegramBotApiClient,
  TelegramMessage,
  TelegramUpdate,
} from "./client.js";
import { handleTelegramCommand } from "./commands.js";
import { sendTelegramFormattedText } from "./outbound.js";

const DEFAULT_TEXT_BURST_WINDOW_MS = 500;
const DEFAULT_MEDIA_GROUP_WINDOW_MS = 500;

type TelegramHumanMessageBase = ChatHumanMessageBase<"telegram">;

type PendingTextBurst = {
  channel: string;
  messageBase: TelegramHumanMessageBase;
  addressedAgentId: string;
  texts: string[];
  timer: ReturnType<typeof setTimeout>;
};

type TelegramInboundContext = {
  chatId: number;
  chatKey: string;
  channel: string;
  messageBase: TelegramHumanMessageBase;
};

type PendingPhotoGroup = {
  channel: string;
  groupId: string;
  messageBase: TelegramHumanMessageBase;
  addressedAgentId: string;
  caption?: string;
  items: Array<{
    messageId: number;
    fileId: string;
  }>;
  timer: ReturnType<typeof setTimeout>;
};

export interface TelegramChannelBridgeConfig {
  channelBus: ChannelBus;
  mediaDir: string;
  identityStore: IdentityStore;
  surfaceId: string;
  instanceId: string;
  channelPrefix: string;
  defaultAgentId: string;
  threadStateStore: SurfaceThreadStateStore;
  channelMemberships?: ChannelMembershipStore;
  userPresenceStore?: UserPresenceStore;
  allowedChatIds: number[];
  users?: Record<string, {
    userId: string;
    actorId: string;
    displayName?: string;
  }>;
  textBurstWindowMs?: number;
  mediaGroupWindowMs?: number;
}

export class TelegramChannelBridge {
  private readonly pendingTextBursts = new PendingByThread<PendingTextBurst>();
  private readonly pendingPhotoGroups = new PendingByThread<PendingPhotoGroup>();
  private readonly publisher: ChatSurfacePublisher;
  private readonly textBurstWindowMs: number;
  private readonly mediaGroupWindowMs: number;

  constructor(
    private readonly config: TelegramChannelBridgeConfig,
    private readonly client: TelegramBotApiClient,
  ) {
    this.textBurstWindowMs = config.textBurstWindowMs ?? DEFAULT_TEXT_BURST_WINDOW_MS;
    this.mediaGroupWindowMs = config.mediaGroupWindowMs ?? DEFAULT_MEDIA_GROUP_WINDOW_MS;
    if (config.allowedChatIds.length === 0) {
      throw new Error("telegram bridge requires at least one allowed chat id");
    }
    if (!existsSync(config.mediaDir)) {
      mkdirSync(config.mediaDir, { recursive: true });
    }
    this.publisher = new ChatSurfacePublisher({
      channelBus: config.channelBus,
      surfaceId: config.surfaceId,
      defaultAgentId: config.defaultAgentId,
      threadStateStore: config.threadStateStore,
    });
  }

  async flushPending(): Promise<void> {
    const chatIds = new Set([
      ...this.pendingTextBursts.keys(),
      ...this.pendingPhotoGroups.keys(),
    ]);
    for (const chatId of chatIds) {
      await this.flushPendingForChat(chatId);
    }
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg) return;

    const context = this.buildInboundContext(msg);
    if (!context) return;
    const { channel, chatId, chatKey, messageBase } = context;

    if (msg.photo && msg.photo.length > 0) {
      await this.flushTextBurst(chatKey);
      await this.handlePhoto(channel, messageBase, msg);
      return;
    }

    if (msg.text) {
      if (looksLikeTelegramCommand(msg.text)) {
        await this.flushPendingForChat(chatKey);
        if (await this.handleCommand(channel, messageBase, chatId, msg.text)) {
          return;
        }
        this.appendText(
          channel,
          messageBase,
          msg.text,
          this.publisher.resolveAddressedAgentId(chatKey),
        );
        return;
      }
      await this.flushPhotoGroup(chatKey);
      this.bufferText(
        channel,
        messageBase,
        msg.text,
        this.publisher.resolveAddressedAgentId(chatKey),
      );
    }

    const unsupported = describeUnsupportedTelegramMessage(msg);
    if (unsupported) {
      await this.flushPendingForChat(chatKey);
      this.appendUnsupportedMedia(
        channel,
        messageBase,
        unsupported,
        this.publisher.resolveAddressedAgentId(chatKey),
      );
    }
  }

  private buildInboundContext(
    msg: TelegramMessage,
  ): TelegramInboundContext | null {
    const chatId = msg.chat.id;
    if (!this.config.allowedChatIds.includes(chatId)) {
      return null;
    }

    const chatKey = String(chatId);
    const channel = `${this.config.channelPrefix}${chatId}`;
    this.config.channelMemberships?.bindChannel(channel, {
      adapter: "telegram",
      instance: this.config.instanceId,
      thread: chatKey,
    });
    const transportUserId = String(msg.from?.id ?? chatId);
    const displayName = msg.from
      ? msg.from.username ?? msg.from.first_name
      : `${this.config.surfaceId}-${chatId}`;
    const configuredUser = this.config.users?.[transportUserId];
    const identity = this.config.identityStore.resolveHuman({
      transport: "telegram",
      transportUserId,
      userId: configuredUser?.userId,
      actorId: configuredUser?.actorId,
      displayName: configuredUser?.displayName ?? displayName,
    });
    this.config.userPresenceStore?.record({
      userId: identity.userId,
      channel,
      surface: this.config.surfaceId,
      transport: "telegram",
      transportChatId: chatKey,
    });

    return {
      chatId,
      chatKey,
      channel,
      messageBase: {
        sender: {
          kind: "human",
          actorId: identity.actorId,
          userId: identity.userId,
          displayName: identity.displayName ?? displayName,
        },
        origin: {
          transport: "telegram",
          transportUserId,
          transportChatId: chatKey,
        },
      },
    };
  }

  private async flushPendingForChat(chatId: string): Promise<void> {
    await this.flushTextBurst(chatId);
    await this.flushPhotoGroup(chatId);
  }

  private bufferText(
    channel: string,
    messageBase: TelegramHumanMessageBase,
    text: string,
    addressedAgentId: string,
  ): void {
    const chatId = messageBase.origin.transportChatId;
    const existing = this.pendingTextBursts.get(chatId);
    if (existing) {
      existing.texts.push(text);
      this.pendingTextBursts.restartTimer(
        chatId,
        () => this.startTextBurstFlushTimer(chatId),
      );
      return;
    }

    this.pendingTextBursts.set(chatId, {
      channel,
      messageBase,
      addressedAgentId,
      texts: [text],
      timer: this.startTextBurstFlushTimer(chatId),
    });
  }

  private startTextBurstFlushTimer(
    chatId: string,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      void this.flushTextBurst(chatId).catch((err: unknown) => {
        console.error("[telegram] text burst flush failed:", err);
      });
    }, this.textBurstWindowMs);
  }

  private async flushTextBurst(chatId: string): Promise<void> {
    const pending = this.pendingTextBursts.delete(chatId);
    if (!pending) return;

    this.appendText(
      pending.channel,
      pending.messageBase,
      mergeChatTextBurst(pending.texts),
      pending.addressedAgentId,
    );
  }

  private startPhotoGroupFlushTimer(
    chatId: string,
  ): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      void this.flushPhotoGroup(chatId).catch((err: unknown) => {
        console.error("[telegram] photo group flush failed:", err);
      });
    }, this.mediaGroupWindowMs);
  }

  private async bufferPhotoGroup(
    channel: string,
    messageBase: TelegramHumanMessageBase,
    msg: TelegramMessage,
  ): Promise<void> {
    const groupId = msg.media_group_id;
    const photo = msg.photo?.[msg.photo.length - 1];
    if (!groupId || !photo) return;

    const chatId = messageBase.origin.transportChatId;
    const existing = this.pendingPhotoGroups.get(chatId);
    if (existing && existing.groupId !== groupId) {
      await this.flushPhotoGroup(chatId);
    }

    const current = this.pendingPhotoGroups.get(chatId);
    if (current) {
      if (!current.items.some((item) => item.messageId === msg.message_id)) {
        current.items.push({
          messageId: msg.message_id,
          fileId: photo.file_id,
        });
      }
      if (!current.caption && msg.caption) {
        current.caption = msg.caption;
      }
      this.pendingPhotoGroups.restartTimer(
        chatId,
        () => this.startPhotoGroupFlushTimer(chatId),
      );
      return;
    }

    this.pendingPhotoGroups.set(chatId, {
      channel,
      groupId,
      messageBase,
      addressedAgentId: this.publisher.resolveAddressedAgentId(chatId),
      caption: msg.caption,
      items: [{
        messageId: msg.message_id,
        fileId: photo.file_id,
      }],
      timer: this.startPhotoGroupFlushTimer(chatId),
    });
  }

  private async flushPhotoGroup(chatId: string): Promise<void> {
    const pending = this.pendingPhotoGroups.delete(chatId);
    if (!pending) return;
    await this.publishPhotos(
      pending.channel,
      pending.messageBase,
      pending.addressedAgentId,
      pending.items.map((item) => item.fileId),
      pending.caption,
      pending.items.length > 1,
    );
  }

  private async handleCommand(
    channel: string,
    messageBase: TelegramHumanMessageBase,
    chatId: number,
    text: string,
  ): Promise<boolean> {
    return handleTelegramCommand(
      {
        channelBus: this.config.channelBus,
        surfaceId: this.config.surfaceId,
        defaultAgentId: this.config.defaultAgentId,
        threadStateStore: this.config.threadStateStore,
        sendText: async (targetChatId, replyText) => {
          await sendTelegramFormattedText(this.client, targetChatId, replyText);
        },
      },
      {
        channel,
        chatId,
        text,
        sender: messageBase.sender,
        origin: messageBase.origin,
      },
    );
  }

  private appendText(
    channel: string,
    messageBase: TelegramHumanMessageBase,
    text: string,
    addressedAgentId: string,
  ): void {
    this.publisher.publishText({
      channel,
      messageBase,
      text,
      addressedAgentId,
    });
  }

  private appendUnsupportedMedia(
    channel: string,
    messageBase: TelegramHumanMessageBase,
    media: UnsupportedSurfaceMessage,
    addressedAgentId: string,
  ): void {
    this.publisher.publishUnsupportedMedia({
      channel,
      messageBase,
      media,
      addressedAgentId,
    });
  }

  private async handlePhoto(
    channel: string,
    messageBase: TelegramHumanMessageBase,
    msg: TelegramMessage,
  ): Promise<void> {
    const photos = msg.photo;
    if (!photos || photos.length === 0) return;

    if (msg.media_group_id) {
      await this.bufferPhotoGroup(channel, messageBase, msg);
      return;
    }

    await this.flushPhotoGroup(messageBase.origin.transportChatId);

    // Telegram provides sizes in ascending order; use the largest.
    const photo = photos.at(-1);
    if (!photo) return;

    try {
      await this.publishPhotos(
        channel,
        messageBase,
        this.publisher.resolveAddressedAgentId(messageBase.origin.transportChatId),
        [photo.file_id],
        msg.caption,
        false,
      );
    } catch (err) {
      console.error("[telegram] photo download failed:", err);
      this.appendUnsupportedMedia(
        channel,
        messageBase,
        {
          mediaKind: "photo",
          caption: msg.caption,
        },
        this.publisher.resolveAddressedAgentId(messageBase.origin.transportChatId),
      );
    }
  }

  private async publishPhotos(
    channel: string,
    messageBase: TelegramHumanMessageBase,
    addressedAgentId: string,
    fileIds: string[],
    caption?: string,
    grouped = false,
  ): Promise<void> {
    const paths: string[] = [];
    for (const fileId of fileIds) {
      try {
        paths.push(await this.savePhoto(fileId));
      } catch (err) {
        console.error("[telegram] photo download failed:", err);
      }
    }

    if (paths.length === 0) {
      this.appendUnsupportedMedia(
        channel,
        messageBase,
        {
          mediaKind: grouped ? "photo_group" : "photo",
          caption,
        },
        addressedAgentId,
      );
      return;
    }

    this.publisher.publishImages({
      channel,
      messageBase,
      paths,
      caption,
      addressedAgentId,
    });
  }

  private async savePhoto(fileId: string): Promise<string> {
    const { filePath, data } = await this.client.downloadFileById(fileId);
    const ext = (filePath.split(".").pop() ?? "") || "bin";
    const filename = `${Date.now()}-${fileId.slice(0, 8)}.${ext}`;
    const localPath = join(this.config.mediaDir, filename);
    await writeFile(localPath, data);
    return localPath;
  }
}

function looksLikeTelegramCommand(text: string): boolean {
  return /^\s*\/[a-z0-9_]+(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text);
}

function describeUnsupportedTelegramMessage(
  msg: TelegramMessage,
): UnsupportedSurfaceMessage | null {
  if (msg.text || (msg.photo && msg.photo.length > 0)) return null;
  if (msg.document) {
    return {
      mediaKind: "document",
      fileName: msg.document.file_name,
      caption: msg.caption,
    };
  }
  if (msg.voice) return { mediaKind: "voice", caption: msg.caption };
  if (msg.audio) return { mediaKind: "audio", caption: msg.caption };
  if (msg.video) return { mediaKind: "video", caption: msg.caption };
  if (msg.animation) return { mediaKind: "animation", caption: msg.caption };
  if (msg.sticker) return { mediaKind: "sticker" };
  if (msg.location) {
    return {
      mediaKind: "location",
      latitude: msg.location.latitude,
      longitude: msg.location.longitude,
    };
  }
  if (msg.contact) {
    return {
      mediaKind: "contact",
      firstName: msg.contact.first_name,
      lastName: msg.contact.last_name,
      phoneNumber: msg.contact.phone_number,
    };
  }
  return { mediaKind: "other", caption: msg.caption };
}
