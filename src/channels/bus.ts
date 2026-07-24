import {
  EgressRegistryChannelEgress,
  type ChannelActivity,
  type ChannelActivityHandle,
  type ChannelEgress,
  type EgressRegistry,
} from "./egress.js";
import type { ChannelMembershipStore } from "./membership.js";
import {
  agentTextMessageInput,
  humanImageGroupMessageInput,
  humanImageMessageInput,
  humanTextMessageInput,
  humanUnsupportedMediaMessageInput,
  makeMessage,
  statusMessageInput,
  systemMessageInput,
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
  egress?: ChannelEgress;
  memberships?: ChannelMembershipStore;
}

export class ChannelBus {
  private readonly store: ChannelStore;
  private readonly egress: ChannelEgress;
  private readonly memberships?: ChannelMembershipStore;

  constructor(
    readonly channelsDir: string,
    egressRegistry?: EgressRegistry,
    deps?: ChannelBusDeps,
  ) {
    this.store = deps?.store ?? new ChannelStore(channelsDir);
    this.egress = deps?.egress ?? new EgressRegistryChannelEgress(egressRegistry);
    this.memberships = deps?.memberships;
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

  currentCursors(): Record<string, ChannelCursor> {
    return this.store.currentCursors();
  }

  publish(input: PublishChannelMessageInput): ChannelMessage {
    const message = makeMessage({
      sender: input.sender,
      origin: input.origin,
      content: input.content,
      timestamp: input.timestamp,
      id: input.id,
    });
    this.store.append(input.channel, message);
    return message;
  }

  publishHumanText(input: PublishHumanTextInput): ChannelMessage {
    return this.publish(humanTextMessageInput(input));
  }

  publishAgentText(input: PublishAgentTextInput): ChannelMessage {
    return this.publish(agentTextMessageInput(input));
  }

  publishHumanImage(input: PublishHumanImageInput): ChannelMessage {
    return this.publish(humanImageMessageInput(input));
  }

  publishHumanImageGroup(input: PublishHumanImageGroupInput): ChannelMessage {
    return this.publish(humanImageGroupMessageInput(input));
  }

  publishHumanUnsupportedMedia(
    input: PublishHumanUnsupportedMediaInput,
  ): ChannelMessage {
    return this.publish(humanUnsupportedMediaMessageInput(input));
  }

  publishSystem(input: PublishSystemInput): ChannelMessage {
    return this.publish(systemMessageInput(input));
  }

  publishStatus(input: PublishStatusInput): ChannelMessage {
    return this.publish(statusMessageInput(input));
  }

  async startActivity(
    activity: ChannelActivity,
  ): Promise<ChannelActivityHandle | null> {
    const binding = activity.binding ??
      this.memberships?.getManifest(activity.channel).binding;
    return this.egress.startActivity({ ...activity, binding });
  }
}
