import type { Channel, ChatClient, Thread } from "../../contracts/chat/index.ts";

/**
 * The channels the agent is in, as chat last said, so that an event can be told
 * to be in a DM or a room, and who is in it, and the threads of each, so that a
 * thread can be told to be its channel's main one or to have a name. Chat is
 * asked again when a channel is not known, when a member that is looked for is
 * not in the channel as it was last said, because members are added to a room,
 * and when a thread is not among the channel's, because threads are made. What
 * chat says of a name that changes is heard when chat is next asked, or when the
 * agent starts.
 */
export interface Channels {
  /**
   * The channel with this ID, among the ones the agent is in, or undefined when
   * chat does not list it. `members` are IDs the channel should have.
   */
  find(chat: ChatClient, channelId: string, signal: AbortSignal, members?: readonly string[]): Promise<Channel | undefined>;
  /** The thread with this ID among a channel's, or undefined when chat does not list it. */
  thread(chat: ChatClient, channelId: string, threadId: string, signal: AbortSignal): Promise<Thread | undefined>;
}

export function knownChannels(): Channels {
  let known = new Map<string, Channel>();
  const threads = new Map<string, Thread[]>();
  return {
    async find(chat, channelId, signal, members = []) {
      const cached = known.get(channelId);
      if (cached !== undefined && members.every((id) => cached.members.some((member) => member.id === id))) return cached;
      known = new Map((await chat.channels(signal)).map((channel) => [channel.id, channel]));
      return known.get(channelId);
    },

    async thread(chat, channelId, threadId, signal) {
      const cached = threads.get(channelId)?.find((thread) => thread.id === threadId);
      if (cached !== undefined) return cached;
      const asked = await chat.threads(channelId, signal);
      threads.set(channelId, asked);
      return asked.find((thread) => thread.id === threadId);
    },
  };
}
