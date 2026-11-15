import type { Channel } from "../../contracts/chat/index.ts";
import type { ChatCalls } from "../links/index.ts";

/**
 * The channels the agent is in, as chat says them now, so that an event can be
 * told to be in a DM or a room, and who is in it. Chat keeps the list live on
 * the `Chat` the agent holds, so a member added to a room is there at once.
 */
export interface Channels {
  /** The channel with this ID, among the ones the agent is in, or undefined when chat does not list it. */
  find(chat: ChatCalls, channelId: string): Channel | undefined;
}

export function knownChannels(): Channels {
  return {
    find: (chat, channelId) => chat.channels().find((channel) => channel.id === channelId),
  };
}
