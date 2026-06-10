import {
  EgressRegistryChannelEgress,
  type ChannelActivity,
  type ChannelActivityHandle,
  type ChannelDelivery,
  type ChannelEgress,
  type EgressRegistry,
} from "./egress.js";
import { ChannelPublisher } from "./publisher.js";
import {
  type ChannelMessage,
  type PublishAgentTextInput,
  type PublishChannelMessageInput,
  type PublishHumanImageGroupInput,
  type PublishHumanImageInput,
  type PublishHumanTextInput,
  type PublishHumanUnsupportedMediaInput,
  type PublishStatusInput,
  type PublishSystemInput,
} from "./protocol.js";
import {
  ChannelStore,
  type ChannelCallback,
  type ChannelCursor,
  type ChannelWatcher,
  type ReadResult,
} from "./store.js";

interface ChannelBusDeps {
  store?: ChannelStore;
  publisher?: ChannelPublisher;
  egress?: ChannelEgress;
}

export class ChannelBus {
  private readonly store: ChannelStore;
  private readonly publisher: ChannelPublisher;
  private readonly egress: ChannelEgress;

  constructor(
    readonly channelsDir: string,
    egressRegistry?: EgressRegistry,
    deps?: ChannelBusDeps,
  ) {
    this.store = deps?.store ?? new ChannelStore(channelsDir);
    this.publisher = deps?.publisher ?? new ChannelPublisher(this.store);
    this.egress = deps?.egress ?? new EgressRegistryChannelEgress(egressRegistry);
  }

  path(channel: string): string {
    return this.store.path(channel);
  }

  append(channel: string, message: ChannelMessage): number {
    return this.store.append(channel, message);
  }

  read(channel: string, cursor?: ChannelCursor): ReadResult {
    return this.store.read(channel, cursor);
  }

  watch(
    callback: ChannelCallback,
    cursors?: Record<string, ChannelCursor>,
  ): ChannelWatcher {
    return this.store.watch(callback, cursors);
  }

  drainBacklog(
    cursors: Record<string, ChannelCursor>,
    callback: ChannelCallback,
  ): Record<string, ChannelCursor> {
    return this.store.drainBacklog(cursors, callback);
  }

  publish(input: PublishChannelMessageInput): ChannelMessage {
    return this.publisher.publish(input);
  }

  publishHumanText(input: PublishHumanTextInput): ChannelMessage {
    return this.publisher.publishHumanText(input);
  }

  publishAgentText(input: PublishAgentTextInput): ChannelMessage {
    return this.publisher.publishAgentText(input);
  }

  publishHumanImage(input: PublishHumanImageInput): ChannelMessage {
    return this.publisher.publishHumanImage(input);
  }

  publishHumanImageGroup(input: PublishHumanImageGroupInput): ChannelMessage {
    return this.publisher.publishHumanImageGroup(input);
  }

  publishHumanUnsupportedMedia(
    input: PublishHumanUnsupportedMediaInput,
  ): ChannelMessage {
    return this.publisher.publishHumanUnsupportedMedia(input);
  }

  publishSystem(input: PublishSystemInput): ChannelMessage {
    return this.publisher.publishSystem(input);
  }

  publishStatus(input: PublishStatusInput): ChannelMessage {
    return this.publisher.publishStatus(input);
  }

  async deliverText(channel: string, text: string): Promise<boolean> {
    return this.egress.deliverText(channel, text);
  }

  async deliver(delivery: ChannelDelivery): Promise<boolean> {
    return this.egress.deliver(delivery);
  }

  async startActivity(
    activity: ChannelActivity,
  ): Promise<ChannelActivityHandle | null> {
    return this.egress.startActivity(activity);
  }

  async sendAgentText(input: PublishAgentTextInput): Promise<boolean> {
    const message = this.publishAgentText(input);
    return this.deliver({
      channel: input.channel,
      text: input.text,
      message,
      publication: input.publication,
    });
  }
}
