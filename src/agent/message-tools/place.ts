import type { Context } from "@earendil-works/chord";
import type { DocumentReader } from "@earendil-works/pi-durable";
import type { Channel, ChatClient, Member, Thread } from "../../contracts/chat/index.ts";
import type { GatewayConnection, RosterEntry } from "../../contracts/gateway/index.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
import { threadOfSession } from "../records/index.ts";
import * as words from "./words.ts";

/** A thread a tool means, and what the model calls it. */
export interface Place {
  threadId: string;
  /** "this thread", "your DM with Zach" or "the room #ops". */
  label: string;
  /** Whether it is the thread the turn came from. */
  here: boolean;
}

/** A place that cannot be used, in words the model can act on. */
export interface Unusable {
  problem: string;
}

export interface Find {
  /** Which argument named the place, for the words that complain about it. */
  argument: words.PlaceArgument;
  /** What the model gave, if anything: `@name` for a DM, `#room` or `#room/thread` for a room. */
  value: string | undefined;
  /** The session the tool runs in, as the engine numbers it. */
  conversationId: number;
  read: DocumentReader;
  chat: ChatClient;
  /** The agent, as chat knows it. */
  self: Member;
  /** The way to the roster, if it is up. */
  gateway: GatewayConnection | undefined;
  /** Whether a DM with a member that there is none with yet is started. Posting starts one; reading does not. */
  startDm: boolean;
  context: Context;
  signal: AbortSignal;
}

/**
 * The thread a tool means. With nothing given it is the thread the turn came
 * from. `@name` is the main thread of the agent's DM with that member of the
 * roster, found through the gateway and made if there is no DM yet. `#room` is
 * the main thread of a room the agent is in, and `#room/thread` one of that
 * room's threads, by its name or its ID.
 */
export async function placeOf(find: Find): Promise<Place | Unusable> {
  const { argument, value, self } = find;
  const current = await threadOfSession(find.read, find.conversationId, find.context);
  if (value === undefined) {
    if (current === undefined) return { problem: words.noThreadHere(argument) };
    return { threadId: current.threadId, label: words.THIS_THREAD, here: true };
  }

  const written = value.trim();
  if (written.startsWith("#")) return roomPlace(find, written.slice(1).trim(), current?.threadId);

  const name = /^@(.+)$/s.exec(written)?.[1]?.trim();
  if (name === undefined) return { problem: words.badPlace(argument) };

  const roster = await rosterOf(find.gateway);
  if (roster === undefined) return { problem: words.noRoster(name, argument) };
  const wanted = name.toLowerCase();
  const member = roster.find((each) => each.name.toLowerCase() === wanted);
  if (member === undefined) return { problem: words.nobody(name, roster.map((each) => each.name)) };
  if (member.id === self.id) return { problem: words.yourself(name, argument) };

  const label = words.dmWith(member.name);
  const channel = find.startDm
    ? await find.chat.openDm(member.id, find.signal)
    : (await find.chat.channels(find.signal)).find(
        (each) => each.kind === "dm" && each.members.some((other) => other.id === member.id),
      );
  if (channel === undefined) return { problem: words.noDmYet(member.name) };
  const main = (await find.chat.threads(channel.id, find.signal)).find((thread) => thread.main);
  if (main === undefined) return { problem: words.noMainThread(label) };
  return { threadId: main.id, label, here: main.id === current?.threadId };
}

/** The main thread of a room the agent is in, or one of its threads when `written` goes on after the room's name with a slash. */
async function roomPlace(find: Find, written: string, current: string | undefined): Promise<Place | Unusable> {
  const rooms = (await find.chat.channels(find.signal)).filter((channel) => channel.kind === "room");
  const found = roomNamed(rooms, written);
  if (found === undefined) {
    return { problem: words.notInRoom(written.split("/")[0]?.trim() ?? written, rooms.map((room) => room.name)) };
  }
  const { room, thread } = found;
  const threads = await find.chat.threads(room.id, find.signal);

  if (thread === "") {
    const main = threads.find((candidate) => candidate.main);
    const label = words.roomLabel(room.name);
    if (main === undefined) return { problem: words.noMainThread(label) };
    return { threadId: main.id, label, here: main.id === current };
  }
  const wanted = thread.toLowerCase();
  const byId = threads.filter((candidate) => candidate.id.toLowerCase() === wanted);
  const matches = byId.length > 0 ? byId : threads.filter((candidate) => candidate.name?.toLowerCase() === wanted);
  const [only, ...others] = matches;
  if (only === undefined) return { problem: words.noSuchThread(room.name, thread, threads) };
  if (others.length > 0) return { problem: words.manyThreads(room.name, thread, matches) };
  return { threadId: only.id, label: words.roomThreadLabel(nameOf(only), room.name), here: only.id === current };
}

const nameOf = (thread: Thread): string => thread.name ?? thread.id;

/**
 * The room that `written` means, whatever the case, and the rest of it after a
 * slash, which is a thread, or "" when it names the room alone. A room's name
 * may have a slash in it, so the whole text is tried first and then the longest
 * room name that it starts with.
 */
function roomNamed(rooms: Channel[], written: string): { room: Channel; thread: string } | undefined {
  const lowered = written.toLowerCase();
  const named = rooms.map((room) => ({ room, name: room.name.toLowerCase() }));
  const whole = named.find((each) => each.name === lowered);
  if (whole !== undefined) return { room: whole.room, thread: "" };
  const longest = named.filter((each) => lowered.startsWith(`${each.name}/`)).sort((a, b) => b.name.length - a.name.length)[0];
  return longest === undefined ? undefined : { room: longest.room, thread: written.slice(longest.name.length + 1).trim() };
}

/** Everyone on the roster, or undefined when the gateway cannot be asked. */
async function rosterOf(gateway: GatewayConnection | undefined): Promise<RosterEntry[] | undefined> {
  if (gateway === undefined) return undefined;
  try {
    return await gateway.members();
  } catch (error) {
    // A connection that drops while asking is the gateway being unreachable too.
    if (isDisconnected(error)) return undefined;
    throw error;
  }
}
