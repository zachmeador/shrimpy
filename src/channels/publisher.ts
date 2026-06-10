import type { ChannelStore } from "./store.js";
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

export class ChannelPublisher {
  constructor(private readonly store: ChannelStore) {}

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
}
