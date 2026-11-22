import { type Channel, channelLabel, roomLabel, type Thread } from "../../contracts/chat/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { agentNameOf, type Model, type Place } from "../state/index.ts";
import type { InFull } from "./words.ts";

/** What every level is made with. */
export interface LevelOptions {
  /** The moment it is, in milliseconds since the epoch, for saying when things happened. */
  now: number;
  /** What the client calls itself in a sentence, such as "this console". */
  self: string;
}

/** What is shown in full where work is shown: nothing, unless a client asks. */
export const BRIEF: InFull = { toolCalls: false, thinking: false };

/** A row of a list the person chooses from. */
export interface Row {
  /** What the state is told when the row is chosen: an agent's member ID, the channel ID of a room or of a channel only read, a thread's ID or the address of a session behind no thread. It is never shown. */
  id: string;
  /** What choosing it opens: a thread is opened as the conversation it is, and a session as the agent's view of it. */
  kind: "agent" | "room" | "read-only" | "thread" | "session";
  label: string;
  detail: string;
  working: boolean;
}

/** The channel whose list is open, or that a thread is in: the person's DM with an agent, a room, or a channel they only read. */
export interface Looking {
  /** The agent's name, or the room's. */
  name: string;
  /** What the conversation is called: the agent's name, or the room's or the channel's label. */
  label: string;
  channel: Channel | undefined;
  threads: Thread[];
}

export function lookingAt(model: Model, place: Place): Looking {
  if (place.kind === "agent") {
    const dm = model.dms[place.id];
    const name = agentNameOf(model, place.id);
    return { name, label: oneLine(name), channel: dm?.channel, threads: dm?.threads ?? [] };
  }
  const found = place.kind === "room" ? model.rooms[place.id] : model.readOnly[place.id];
  return {
    name: found?.channel.name ?? place.id,
    label: found === undefined ? roomLabel(place.id) : channelLabel(found.channel),
    channel: found?.channel,
    threads: found?.threads ?? [],
  };
}
