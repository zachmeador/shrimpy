import type { Context } from "@earendil-works/chord/context";
import type { DocumentReader } from "@earendil-works/pi-durable";
import { type Channel, findDm, findRoom, type Member, notInRoom, roomLabel, type Thread } from "../../contracts/chat/index.ts";
import { nameKey, type RosterEntry } from "../../contracts/gateway/index.ts";
import { type ChatCalls, type Named, nameOnRoster } from "../links/index.ts";
import { threadOfSession } from "../records/durable.ts";
import * as words from "./words.ts";

/** A thread a tool means, and what the model calls it. */
export interface Place {
  threadId: string;
  /** "this thread", "the thread thr_1 of your DM with Zach" or "the room #ops". */
  label: string;
  /** Whether it is the thread the turn came from. */
  here: boolean;
  /** For a thread a post started, what reaches it again: `@name/thread`. */
  again?: string;
}

/** A place that cannot be used, in words the model can act on. */
export interface Unusable {
  problem: string;
}

export interface Find {
  /** Which argument named the place: `to` for a post, which starts a thread for `@name`, and `from` for a read. */
  argument: words.PlaceArgument;
  /** What the model gave, if anything: `@name` or `@name/thread` for a DM, `#room` or `#room/thread` for a room. */
  value: string | undefined;
  /** The session the tool runs in, as the engine numbers it. */
  conversationId: number;
  read: DocumentReader;
  chat: ChatCalls;
  /** The agent, as chat knows it. */
  self: Member;
  /** Everyone on the roster, or undefined while the agent has not heard it. */
  roster: readonly RosterEntry[] | undefined;
  /**
   * Given for a post: the ID of the thread a post to `@name` starts, which
   * `make` makes on the call's first run, and which every later run of the
   * same call gets back.
   */
  newThread?: (make: () => Promise<string>) => Promise<string>;
  context: Context;
  signal: AbortSignal;
}

/**
 * The thread a tool means. With nothing given it is the thread the turn came
 * from. `@name` is a new thread of the agent's DM with that member of the
 * roster, made with the DM if there is none yet, when posting; reading it is
 * refused with the DM's threads, since there is no one thread to read.
 * `@name/thread` is one of that DM's threads, and `#room/thread` one of a
 * room's, by its name or its ID. `#room` is the first pinned thread of a room
 * the agent is in, and is refused with the room's threads when it has none.
 */
export async function placeOf(find: Find): Promise<Place | Unusable> {
  const { argument, value } = find;
  const current = await threadOfSession(find.read, find.conversationId, find.context);
  if (value === undefined) {
    if (current === undefined) return { problem: words.noThreadHere(argument) };
    return { threadId: current.threadId, label: words.THIS_THREAD, here: true };
  }

  const written = value.trim();
  if (written.startsWith("#")) return roomPlace(find, written.slice(1).trim(), current?.threadId);
  if (written.startsWith("@") && written.length > 1) return dmPlace(find, written.slice(1).trim(), current?.threadId);
  return { problem: words.badPlace(argument) };
}

/** A thread of the agent's DM with a member: a new one when `written` is the member's name alone, or the one named after a slash. */
async function dmPlace(find: Find, written: string, current: string | undefined): Promise<Place | Unusable> {
  const { argument, self } = find;
  const named = memberAndThread(find.roster, written, self.id);
  if (named.kind === "unknown") return { problem: words.noRoster(firstPart(written), argument) };
  if (named.kind === "nobody") return { problem: words.nobody(firstPart(written), named.roster.map((each) => each.name)) };
  if (named.kind === "self") return { problem: words.yourself(named.member.name, argument) };
  const { member, thread } = named;

  if (thread === "" && argument === "to") {
    const make = async (): Promise<string> => (await find.chat.createThread((await find.chat.openDm(member.id, find.signal)).id, null, find.signal)).id;
    const made = find.newThread === undefined ? await make() : await find.newThread(make);
    return { threadId: made, label: words.newDmThread(member.name, made), here: false, again: `@${member.name}/${made}` };
  }
  const channel = findDm(find.chat.channels(), member.id);
  if (channel === undefined) return { problem: words.noDmYet(member.name, argument) };
  const threads = await find.chat.threads(channel.id, find.signal);
  if (thread === "") return { problem: words.whichDmThread(member.name, threads) };
  const where = words.dmWith(member.name);
  const found = threadCalled(threads, thread);
  if (found === undefined) return { problem: words.noSuchThread(where, thread, threads) };
  if (Array.isArray(found)) return { problem: words.manyThreads(where, thread, found) };
  return { threadId: found.id, label: words.dmThreadLabel(member.name, found.id), here: found.id === current };
}

/** The first pinned thread of a room the agent is in, or one of its threads when `written` goes on after the room's name with a slash. */
async function roomPlace(find: Find, written: string, current: string | undefined): Promise<Place | Unusable> {
  const rooms = find.chat.channels().filter((channel) => channel.kind === "room");
  const found = roomAndThread(rooms, written);
  if (found === undefined) {
    return { problem: notInRoom(firstPart(written), rooms.map((room) => room.name)) };
  }
  const { room, thread } = found;
  const threads = await find.chat.threads(room.id, find.signal);

  if (thread === "") {
    // Chat lists the pinned threads first, oldest pin first.
    const pinned = threads.find((candidate) => candidate.pinned !== null);
    if (pinned === undefined) return { problem: words.whichRoomThread(room.name, threads, find.argument) };
    return { threadId: pinned.id, label: words.theRoom(room.name), here: pinned.id === current };
  }
  const where = roomLabel(room.name);
  const only = threadCalled(threads, thread);
  if (only === undefined) return { problem: words.noSuchThread(where, thread, threads) };
  if (Array.isArray(only)) return { problem: words.manyThreads(where, thread, only) };
  return { threadId: only.id, label: words.roomThreadLabel(nameOf(only), room.name), here: only.id === current };
}

const nameOf = (thread: Thread): string => thread.name ?? thread.id;

/** What was written before its first slash, for words about a name that matched nothing. */
const firstPart = (written: string): string => written.split("/")[0]?.trim() ?? written;

/** The thread called `wanted`, by its ID or else its name, whatever the case, as names are compared; or all of them when more than one is. */
function threadCalled(threads: readonly Thread[], wanted: string): Thread | Thread[] | undefined {
  const key = nameKey(wanted);
  const byId = threads.filter((candidate) => nameKey(candidate.id) === key);
  const matches = byId.length > 0 ? byId : threads.filter((candidate) => candidate.name !== null && nameKey(candidate.name) === key);
  const [only, ...others] = matches;
  return others.length > 0 ? matches : only;
}

/**
 * Each way to read `written` as something before a slash and the rest after
 * it: the whole text first, and then each part of it before a slash, the
 * longest first, since a name may have a slash in it.
 */
function* splits(written: string): Generator<{ before: string; after: string }> {
  for (let end = written.length; end > 0; end = written.lastIndexOf("/", end - 1)) {
    yield { before: written.slice(0, end).trim(), after: written.slice(end + 1).trim() };
  }
}

/** The member of the roster that `written` names, and the rest of it after a slash, which is a thread, or "" when it names the member alone. */
function memberAndThread(
  roster: readonly RosterEntry[] | undefined,
  written: string,
  self: string,
): Exclude<Named, { kind: "found" }> | { kind: "found"; member: RosterEntry; thread: string } {
  if (roster === undefined) return { kind: "unknown" };
  for (const { before, after } of splits(written)) {
    const named = nameOnRoster(roster, before, self);
    if (named.kind === "found") return { ...named, thread: after };
    if (named.kind === "self") return named;
  }
  return { kind: "nobody", roster };
}

/**
 * The room that `written` means, whatever the case, and the rest of it after a
 * slash, which is a thread, or "" when it names the room alone. A room's name
 * may have a slash in it, so the whole text is tried first and then each part
 * of it before a slash, the longest first.
 */
function roomAndThread(rooms: readonly Channel[], written: string): { room: Channel; thread: string } | undefined {
  for (const { before, after } of splits(written)) {
    const room = findRoom(rooms, before);
    if (room !== undefined) return { room, thread: after };
  }
  return undefined;
}
