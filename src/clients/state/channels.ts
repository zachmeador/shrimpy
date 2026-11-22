import type { Channel } from "../../contracts/chat/index.ts";
import type { ChannelShown } from "../network/index.ts";
import type { AgentEntry, ChannelThreads } from "./model.ts";

/**
 * The person's DM with each of `agents` that they have one with, by the agent's
 * member ID, each room they are in, by its channel's ID, and each channel they
 * only read, by its channel's ID, with the threads of each as `shown` has them
 * and how many messages in each are new to the person. A channel is as chat
 * lists it to the person, and its threads and their counts are those the
 * channel's own object shows, or none while it has shown none. An agent they
 * have not talked to has no DM.
 */
export function channelsOf(
  mine: readonly Channel[],
  reading: readonly Channel[],
  shown: (channelId: string) => ChannelShown | undefined,
  agents: Pick<AgentEntry, "id">[],
): { dms: Record<string, ChannelThreads>; rooms: Record<string, ChannelThreads>; readOnly: Record<string, ChannelThreads> } {
  const of = (channel: Channel): ChannelThreads => ({ channel, threads: shown(channel.id)?.threads ?? [], unread: shown(channel.id)?.unread ?? {} });
  const dms: Record<string, ChannelThreads> = {};
  for (const { id } of agents) {
    const channel = mine.find((candidate) => candidate.kind === "dm" && candidate.members.some((member) => member.id === id));
    if (channel !== undefined) dms[id] = of(channel);
  }
  const rooms: Record<string, ChannelThreads> = {};
  for (const channel of mine) {
    if (channel.kind === "room") rooms[channel.id] = of(channel);
  }
  const readOnly: Record<string, ChannelThreads> = {};
  for (const channel of reading) {
    if (!mine.some((own) => own.id === channel.id)) readOnly[channel.id] = of(channel);
  }
  return { dms, rooms, readOnly };
}
