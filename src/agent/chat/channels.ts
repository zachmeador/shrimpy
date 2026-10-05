import type { Channel, ChatClient } from "../../contracts/chat/index.ts";

/**
 * The channels the agent is in, as chat last said, so that an event can be told
 * to be in a room, and who is in it. Chat is asked again when a channel is not
 * known, or when a member that is looked for is not in the channel as it was
 * last said, because members are added to a room.
 */
export interface Channels {
  /**
   * The channel with this ID, among the ones the agent is in, or undefined when
   * chat does not list it. `members` are IDs the channel should have.
   */
  find(chat: ChatClient, channelId: string, signal: AbortSignal, members?: readonly string[]): Promise<Channel | undefined>;
}

export function knownChannels(): Channels {
  let known = new Map<string, Channel>();
  return {
    async find(chat, channelId, signal, members = []) {
      const cached = known.get(channelId);
      if (cached !== undefined && members.every((id) => cached.members.some((member) => member.id === id))) return cached;
      known = new Map((await chat.channels(signal)).map((channel) => [channel.id, channel]));
      return known.get(channelId);
    },
  };
}
