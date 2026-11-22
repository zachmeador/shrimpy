import { type Channel, channelLabel, roomLabel, type Thread } from "../../contracts/chat/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { agentNameOf, type Model, type Place } from "../state/index.ts";
import type { Look } from "./look.ts";
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

/** How many of a tool's last lines a brief call shows, unless a client asks for another number. */
export const OUTPUT_LINES = 6;

/** A row of a list the person chooses from. */
export interface Row {
  /** What the state is told when the row is chosen: an agent's member ID, the channel ID of a room or of a channel only read, a thread's ID or the address of a session behind no thread. It is never shown. */
  id: string;
  /** What choosing it opens: a thread is opened as the conversation it is, and a session as the agent's view of it. */
  kind: "agent" | "room" | "read-only" | "thread" | "session";
  label: string;
  /** What the label names, on its own: a room's name without the mark its label starts with, and for any other row its label. */
  name: string;
  detail: string;
  working: boolean;
  /** How many messages are new to the person in what it opens. */
  unread: number;
  /** On an agent's list, it is in the person's DM with the agent, and so one of their threads with it. */
  yours: boolean;
  /** How the agent a row of the agents and rooms opens looks. */
  look: Look | undefined;
}

/** The channel whose list is open, or that a thread is in: the person's DM with an agent, a room, or a channel they only read. */
export interface Looking {
  /** The agent's name, or the room's. */
  name: string;
  /** What the conversation is called: the agent's name, or the room's or the channel's label. */
  label: string;
  channel: Channel | undefined;
  threads: Thread[];
  /** How many messages in each thread are new to the person, by the thread's ID. */
  unread: Record<string, number>;
}

export function lookingAt(model: Model, place: Place): Looking {
  if (place.kind === "agent") {
    const dm = model.dms[place.id];
    const name = agentNameOf(model, place.id);
    return { name, label: oneLine(name), channel: dm?.channel, threads: dm?.threads ?? [], unread: dm?.unread ?? {} };
  }
  const found = place.kind === "room" ? model.rooms[place.id] : model.readOnly[place.id];
  return {
    name: found?.channel.name ?? place.id,
    label: found === undefined ? roomLabel(place.id) : channelLabel(found.channel),
    channel: found?.channel,
    threads: found?.threads ?? [],
    unread: found?.unread ?? {},
  };
}
