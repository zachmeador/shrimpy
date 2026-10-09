import type { ChatClient } from "../../../contracts/chat/index.ts";
import type { AgentEntry, Dm, ReadOnlyChannel, Room } from "./model.ts";

/**
 * The person's DM with each of `agents` that they have one with, by the agent's
 * name, each room they are in, by its channel's ID, and each channel they only
 * read, by its channel's ID, with the threads of each. An agent they have not
 * talked to has no DM.
 */
export async function readChannels(
  chat: ChatClient,
  agents: Pick<AgentEntry, "id" | "name">[],
): Promise<{ dms: Record<string, Dm>; rooms: Record<string, Room>; readOnly: Record<string, ReadOnlyChannel> }> {
  // What the person only reads is asked for first, so that a room they walk into in between is still found among their own.
  const reading = await chat.readOnlyChannels();
  const channels = await chat.channels();
  const dms: Record<string, Dm> = {};
  for (const { id, name } of agents) {
    const channel = channels.find(
      (candidate) => candidate.kind === "dm" && candidate.members.some((member) => member.id === id),
    );
    if (channel !== undefined) dms[name] = { channel, threads: await chat.threads(channel.id) };
  }
  const rooms: Record<string, Room> = {};
  for (const channel of channels) {
    if (channel.kind === "room") rooms[channel.id] = { channel, threads: await chat.threads(channel.id) };
  }
  const readOnly: Record<string, ReadOnlyChannel> = {};
  for (const channel of reading) {
    if (!channels.some((own) => own.id === channel.id)) readOnly[channel.id] = { channel, threads: await chat.threads(channel.id) };
  }
  return { dms, rooms, readOnly };
}
