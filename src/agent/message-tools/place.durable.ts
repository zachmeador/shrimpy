import type { Context } from "@earendil-works/chord/context";
import type { DocumentReader } from "@earendil-works/pi-durable";
import { type Channel, findDm, findRoom, type Member, notInRoom, type Thread } from "../../contracts/chat/index.ts";
import { nameKey, type RosterEntry } from "../../contracts/gateway/index.ts";
import { type ChatCalls, nameOnRoster } from "../links/index.ts";
import { threadOfSession } from "../records/durable.ts";
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
  chat: ChatCalls;
  /** The agent, as chat knows it. */
  self: Member;
  /** Everyone on the roster, or undefined while the agent has not heard it. */
  roster: readonly RosterEntry[] | undefined;
  /** Whether a DM with a member that there is none with yet is started. Posting starts one; reading does not. */
  startDm: boolean;
  context: Context;
  signal: AbortSignal;
}

/**
 * The thread a tool means. With nothing given it is the thread the turn came
 * from. `@name` is the main thread of the agent's DM with that member of the
 * roster, made if there is no DM yet. `#room` is
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

  const named = nameOnRoster(find.roster, name, self.id);
  if (named.kind === "unknown") return { problem: words.noRoster(name, argument) };
  if (named.kind === "nobody") return { problem: words.nobody(name, named.roster.map((each) => each.name)) };
  if (named.kind === "self") return { problem: words.yourself(name, argument) };
  const { member } = named;

  const label = words.dmWith(member.name);
  const channel = find.startDm ? await find.chat.openDm(member.id, find.signal) : findDm(find.chat.channels(), member.id);
  if (channel === undefined) return { problem: words.noDmYet(member.name) };
  const main = (await find.chat.threads(channel.id, find.signal)).find((thread) => thread.main);
  if (main === undefined) return { problem: words.noMainThread(label) };
  return { threadId: main.id, label, here: main.id === current?.threadId };
}

/** The main thread of a room the agent is in, or one of its threads when `written` goes on after the room's name with a slash. */
async function roomPlace(find: Find, written: string, current: string | undefined): Promise<Place | Unusable> {
  const rooms = find.chat.channels().filter((channel) => channel.kind === "room");
  const found = roomAndThread(rooms, written);
  if (found === undefined) {
    return { problem: notInRoom(written.split("/")[0]?.trim() ?? written, rooms.map((room) => room.name)) };
  }
  const { room, thread } = found;
  const threads = await find.chat.threads(room.id, find.signal);

  if (thread === "") {
    const main = threads.find((candidate) => candidate.main);
    const label = words.roomLabel(room.name);
    if (main === undefined) return { problem: words.noMainThread(label) };
    return { threadId: main.id, label, here: main.id === current };
  }
  // An ID or a name, whatever the case, as names are compared.
  const wanted = nameKey(thread);
  const byId = threads.filter((candidate) => nameKey(candidate.id) === wanted);
  const matches = byId.length > 0 ? byId : threads.filter((candidate) => candidate.name !== null && nameKey(candidate.name) === wanted);
  const [only, ...others] = matches;
  if (only === undefined) return { problem: words.noSuchThread(room.name, thread, threads) };
  if (others.length > 0) return { problem: words.manyThreads(room.name, thread, matches) };
  return { threadId: only.id, label: words.roomThreadLabel(nameOf(only), room.name), here: only.id === current };
}

const nameOf = (thread: Thread): string => thread.name ?? thread.id;

/**
 * The room that `written` means, whatever the case, and the rest of it after a
 * slash, which is a thread, or "" when it names the room alone. A room's name
 * may have a slash in it, so the whole text is tried first and then each part
 * of it before a slash, the longest first.
 */
function roomAndThread(rooms: readonly Channel[], written: string): { room: Channel; thread: string } | undefined {
  for (let end = written.length; end > 0; end = written.lastIndexOf("/", end - 1)) {
    const room = findRoom(rooms, written.slice(0, end));
    if (room !== undefined) return { room, thread: written.slice(end + 1).trim() };
  }
  return undefined;
}
