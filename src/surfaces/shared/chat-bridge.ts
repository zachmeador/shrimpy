import type { ChannelBus } from "../../channels/bus.js";
import type {
  MessageSender,
  UnsupportedSurfaceMessage,
} from "../../channels/index.js";
import type { SurfaceThreadStateStore } from "./thread-state-store.js";

export type ChatHumanMessageBase<TTransport extends string = string> = {
  sender: MessageSender & {
    kind: "human";
    userId: string;
  };
  origin: {
    transport: TTransport;
    transportUserId: string;
    transportChatId: string;
  };
};

export interface ChatSurfacePublisherConfig {
  channelBus: ChannelBus;
  surfaceId: string;
  defaultAgentId: string;
  threadStateStore: SurfaceThreadStateStore;
}

export class ChatSurfacePublisher {
  constructor(private readonly config: ChatSurfacePublisherConfig) {}

  resolveAddressedAgentId(threadId: string): string {
    return this.config.threadStateStore.get(
      this.config.surfaceId,
      threadId,
    ).addressedAgentId ?? this.config.defaultAgentId;
  }

  publishText(input: {
    channel: string;
    messageBase: ChatHumanMessageBase;
    text: string;
    addressedAgentId?: string;
  }): void {
    const { messageBase } = input;
    this.config.channelBus.publishHumanText({
      channel: input.channel,
      text: input.text,
      actorId: messageBase.sender.actorId,
      userId: messageBase.sender.userId,
      displayName: messageBase.sender.displayName,
      transport: messageBase.origin.transport,
      transportUserId: messageBase.origin.transportUserId,
      transportChatId: messageBase.origin.transportChatId,
      addressedAgentId: input.addressedAgentId
        ?? this.resolveAddressedAgentId(messageBase.origin.transportChatId),
    });
  }

  publishUnsupportedMedia(input: {
    channel: string;
    messageBase: ChatHumanMessageBase;
    media: UnsupportedSurfaceMessage;
    addressedAgentId?: string;
  }): void {
    const { messageBase } = input;
    this.config.channelBus.publishHumanUnsupportedMedia({
      channel: input.channel,
      media: input.media,
      actorId: messageBase.sender.actorId,
      userId: messageBase.sender.userId,
      displayName: messageBase.sender.displayName,
      transport: messageBase.origin.transport,
      transportUserId: messageBase.origin.transportUserId,
      transportChatId: messageBase.origin.transportChatId,
      addressedAgentId: input.addressedAgentId
        ?? this.resolveAddressedAgentId(messageBase.origin.transportChatId),
    });
  }

  publishImages(input: {
    channel: string;
    messageBase: ChatHumanMessageBase;
    paths: string[];
    caption?: string;
    addressedAgentId?: string;
  }): void {
    const { messageBase } = input;
    const addressedAgentId = input.addressedAgentId
      ?? this.resolveAddressedAgentId(messageBase.origin.transportChatId);

    if (input.paths.length === 1) {
      this.config.channelBus.publishHumanImage({
        channel: input.channel,
        path: input.paths[0]!,
        caption: input.caption,
        actorId: messageBase.sender.actorId,
        userId: messageBase.sender.userId,
        displayName: messageBase.sender.displayName,
        transport: messageBase.origin.transport,
        transportUserId: messageBase.origin.transportUserId,
        transportChatId: messageBase.origin.transportChatId,
        addressedAgentId,
      });
      return;
    }

    this.config.channelBus.publishHumanImageGroup({
      channel: input.channel,
      paths: input.paths,
      caption: input.caption,
      actorId: messageBase.sender.actorId,
      userId: messageBase.sender.userId,
      displayName: messageBase.sender.displayName,
      transport: messageBase.origin.transport,
      transportUserId: messageBase.origin.transportUserId,
      transportChatId: messageBase.origin.transportChatId,
      addressedAgentId,
    });
  }
}

export class PendingByThread<T extends { timer: ReturnType<typeof setTimeout> }> {
  private readonly entries = new Map<string, T>();

  keys(): IterableIterator<string> {
    return this.entries.keys();
  }

  get(threadId: string): T | undefined {
    return this.entries.get(threadId);
  }

  set(threadId: string, value: T): void {
    this.entries.set(threadId, value);
  }

  delete(threadId: string): T | undefined {
    const value = this.entries.get(threadId);
    if (value) {
      clearTimeout(value.timer);
      this.entries.delete(threadId);
    }
    return value;
  }

  reschedule(
    threadId: string,
    schedule: () => ReturnType<typeof setTimeout>,
  ): T | undefined {
    const value = this.entries.get(threadId);
    if (!value) return undefined;
    clearTimeout(value.timer);
    value.timer = schedule();
    return value;
  }
}

export function mergeChatTextBurst(parts: string[]): string {
  return parts.reduce((merged, part) => {
    if (!merged) return part;
    if (!part) return merged;
    if (merged.endsWith("\n") || part.startsWith("\n")) {
      return `${merged}${part}`;
    }
    return `${merged}\n${part}`;
  }, "");
}
