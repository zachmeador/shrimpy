import type { Channel } from "../../../contracts/chat/index.ts";
import type { ChannelShown } from "../network/index.ts";
import type { AgentEntry, Dm, ReadOnlyChannel, Room } from "./model.ts";

/**
 * The person's DM with each of `agents` that they have one with, by the agent's
 * name, each room they are in, by its channel's ID, and each channel they only
 * read, by its channel's ID, with the threads of each as `shown` has them. A
 * channel is as chat lists it to the person, and its threads are those the
 * channel's own object shows, or none while it has shown none. An agent they
 * have not talked to has no DM.
 */
export function channelsOf(
  mine: readonly Channel[],
  reading: readonly Channel[],
  shown: (channelId: string) => ChannelShown | undefined,
  agents: Pick<AgentEntry, "id" | "name">[],
): { dms: Record<string, Dm>; rooms: Record<string, Room>; readOnly: Record<string, ReadOnlyChannel> } {
  const threadsOf = (channel: Channel): Room["threads"] => shown(channel.id)?.threads ?? [];
  const dms: Record<string, Dm> = {};
  for (const { id, name } of agents) {
    const channel = mine.find((candidate) => candidate.kind === "dm" && candidate.members.some((member) => member.id === id));
    if (channel !== undefined) dms[name] = { channel, threads: threadsOf(channel) };
  }
  const rooms: Record<string, Room> = {};
  for (const channel of mine) {
    if (channel.kind === "room") rooms[channel.id] = { channel, threads: threadsOf(channel) };
  }
  const readOnly: Record<string, ReadOnlyChannel> = {};
  for (const channel of reading) {
    if (!mine.some((own) => own.id === channel.id)) readOnly[channel.id] = { channel, threads: threadsOf(channel) };
  }
  return { dms, rooms, readOnly };
}
