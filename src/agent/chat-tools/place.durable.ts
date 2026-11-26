import type { Context } from "@earendil-works/chord/context";
import type { DocumentReader } from "@earendil-works/pi-durable";
import { type Channel, findDm, findRoom, type Member, notInRoom, roomLabel, type Thread } from "../../contracts/chat/index.ts";
import { nameKey, type RosterEntry } from "../../contracts/gateway/index.ts";
import { type ChatCalls, type Named, nameOnRoster } from "../links/index.ts";
import { threadOfSession } from "../records/durable.ts";
import * as words from "./words.ts";

const THREAD_ID = /^th_[0-9a-z]{12}$/;

/** A resolved thread target, with metadata needed for posting, watches, renaming, and archiving. */
export interface ResolvedThread {
  threadId: string;
  channelId: string;
  revision: number;
  archived: boolean;
  label: string;
  here: boolean;
  /** The other member if this thread belongs to a DM channel. */
  dmWith?: { id: string; name: string; kind: "person" | "agent" };
  /** Present when a brand new DM thread was created for `@name`. */
  created?: true;
}

export interface Unusable {
  problem: string;
}

export interface ResolveThreadOptions {
  argument: string;
  value: string | undefined;
  allowNewDm: boolean;
  conversationId: number;
  read: DocumentReader;
  chat: ChatCalls;
  self: Member;
  roster: readonly RosterEntry[] | undefined;
  newThread?: (make: () => Promise<Thread>) => Promise<Thread>;
  context: Context;
  signal: AbortSignal;
}

/**
 * Resolve a thread target:
 * - omitted -> current thread
 * - bare `th_...` -> search all channels for that thread ID
 * - `@name` -> new DM thread when `allowNewDm`, otherwise error listing threads
 * - `@name/<thread>` -> thread by ID or name in DM with `@name`
 * - `#room` -> first pinned thread in room
 * - `#room/<thread>` -> thread by ID or name in room
 */
export async function resolveThread(opts: ResolveThreadOptions): Promise<ResolvedThread | Unusable> {
  const { argument, value, chat, self } = opts;
  const current = await threadOfSession(opts.read, opts.conversationId, opts.context);
  if (value === undefined || value.trim() === "") {
    if (current === undefined) return { problem: `This session has no thread. Pass ${argument} with a thread ID, @name, or #room.` };
    const found = await findThreadById(chat, current.threadId, self.id, opts.signal, current.channelId);
    if (found === undefined) {
      return {
        threadId: current.threadId,
        channelId: current.channelId,
        revision: 0,
        archived: false,
        label: words.THIS_THREAD,
        here: true,
      };
    }
    return { ...found, label: words.THIS_THREAD, here: true };
  }

  const written = value.trim();
  if (THREAD_ID.test(written)) {
    const found = await findThreadById(chat, written, self.id, opts.signal);
    if (found === undefined) return { problem: words.threadNotFound(written) };
    return { ...found, here: found.threadId === current?.threadId };
  }
  if (written.startsWith("#")) return roomPlace(opts, written.slice(1).trim(), current?.threadId);
  if (written.startsWith("@") && written.length > 1) return dmPlace(opts, written.slice(1).trim(), current?.threadId);
  return { problem: words.badPlace(argument) };
}

/** Resolve a channel target (`@name`, `#room`, or omitted for current channel). */
export async function resolveChannel(opts: {
  value: string | undefined;
  openDmIfMissing: boolean;
  conversationId: number;
  read: DocumentReader;
  chat: ChatCalls;
  self: Member;
  roster: readonly RosterEntry[] | undefined;
  context: Context;
  signal: AbortSignal;
}): Promise<{ channel: Channel; label: string } | Unusable> {
  const { value, chat, self } = opts;
  if (value === undefined || value.trim() === "") {
    const current = await threadOfSession(opts.read, opts.conversationId, opts.context);
    if (current === undefined) return { problem: "Give to: \"@name\" or \"#room\"." };
    const channel = chat.channels().find((ch) => ch.id === current.channelId);
    if (channel === undefined) return { problem: "The current channel is not listed by chat." };
    return { channel, label: channelLabel(channel, self.id) };
  }
  const written = value.trim();
  if (written.startsWith("#")) {
    const rooms = chat.channels().filter((ch) => ch.kind === "room");
    const room = findRoom(rooms, written.slice(1).trim());
    if (room === undefined) return { problem: notInRoom(written.slice(1).trim(), rooms.map((r) => r.name)) };
    return { channel: room, label: words.theRoom(room.name) };
  }
  if (written.startsWith("@") && written.length > 1) {
    const name = written.slice(1).trim();
    if (opts.roster === undefined) return { problem: words.noRoster(name) };
    const named = nameOnRoster(opts.roster, name, self.id);
    if (named.kind === "unknown") return { problem: words.noRoster(name) };
    if (named.kind === "nobody") return { problem: words.nobody(name, named.roster.map((each) => each.name)) };
    if (named.kind === "self") return { problem: words.yourself(named.member.name) };
    const existing = findDm(chat.channels(), named.member.id);
    if (existing !== undefined) return { channel: existing, label: words.dmWith(named.member.name) };
    if (!opts.openDmIfMissing) return { problem: words.noDmYet(named.member.name) };
    const opened = await chat.openDm(named.member.id, opts.signal);
    return { channel: opened, label: words.dmWith(named.member.name) };
  }
  return { problem: 'to must be "@name" or "#room".' };
}

async function findThreadById(
  chat: ChatCalls,
  threadId: string,
  selfId: string,
  signal: AbortSignal,
  hintChannelId?: string,
): Promise<Omit<ResolvedThread, "here"> | undefined> {
  const channels = chat.channels();
  const ordered =
    hintChannelId === undefined
      ? channels
      : [...channels.filter((c) => c.id === hintChannelId), ...channels.filter((c) => c.id !== hintChannelId)];
  for (const channel of ordered) {
    const threads = await chat.threads(channel.id, signal);
    const found = threads.find((t) => t.id === threadId);
    if (found === undefined) continue;
    const dmOther = channel.kind === "dm" ? channel.members.find((m) => m.id !== selfId) : undefined;
    const label =
      channel.kind === "room"
        ? words.roomThreadLabel(found.name ?? found.id, channel.name)
        : words.dmThreadLabel(dmOther?.name ?? channel.name, found.id);
    return {
      threadId: found.id,
      channelId: channel.id,
      revision: found.revision,
      archived: found.archived,
      label,
      ...(dmOther === undefined ? {} : { dmWith: { id: dmOther.id, name: dmOther.name, kind: dmOther.kind } }),
    };
  }
  return undefined;
}

async function dmPlace(opts: ResolveThreadOptions, written: string, current: string | undefined): Promise<ResolvedThread | Unusable> {
  const { allowNewDm, self } = opts;
  const named = memberAndThread(opts.roster, written, self.id);
  if (named.kind === "unknown") return { problem: words.noRoster(firstPart(written)) };
  if (named.kind === "nobody") return { problem: words.nobody(firstPart(written), named.roster.map((each) => each.name)) };
  if (named.kind === "self") return { problem: words.yourself(named.member.name) };
  const { member, thread } = named;
  const dmWith = { id: member.id, name: member.name, kind: member.kind };

  if (thread === "" && allowNewDm) {
    const make = async (): Promise<Thread> => {
      const dm = await opts.chat.openDm(member.id, opts.signal);
      return opts.chat.createThread(dm.id, null, opts.signal);
    };
    const made = opts.newThread === undefined ? await make() : await opts.newThread(make);
    return {
      threadId: made.id,
      channelId: made.channelId,
      revision: made.revision,
      archived: made.archived,
      label: words.newDmThread(member.name, made.id),
      here: false,
      dmWith,
      created: true,
    };
  }

  const channel = findDm(opts.chat.channels(), member.id);
  if (channel === undefined) return { problem: words.noDmYet(member.name) };
  const threads = await opts.chat.threads(channel.id, opts.signal);
  if (thread === "") return { problem: words.whichDmThread(member.name, threads) };
  const where = words.dmWith(member.name);
  const found = threadCalled(threads, thread);
  if (found === undefined) return { problem: words.noSuchThread(where, thread, threads) };
  if (Array.isArray(found)) return { problem: words.manyThreads(where, thread, found) };
  return {
    threadId: found.id,
    channelId: channel.id,
    revision: found.revision,
    archived: found.archived,
    label: words.dmThreadLabel(member.name, found.id),
    here: found.id === current,
    dmWith,
  };
}

async function roomPlace(opts: ResolveThreadOptions, written: string, current: string | undefined): Promise<ResolvedThread | Unusable> {
  const rooms = opts.chat.channels().filter((channel) => channel.kind === "room");
  const found = roomAndThread(rooms, written);
  if (found === undefined) return { problem: notInRoom(firstPart(written), rooms.map((room) => room.name)) };
  const { room, thread } = found;
  const threads = await opts.chat.threads(room.id, opts.signal);

  if (thread === "") {
    const pinned = threads.find((candidate) => candidate.pinned !== null);
    if (pinned === undefined) return { problem: words.whichRoomThread(room.name, threads) };
    return {
      threadId: pinned.id,
      channelId: room.id,
      revision: pinned.revision,
      archived: pinned.archived,
      label: words.theRoom(room.name),
      here: pinned.id === current,
    };
  }
  const where = roomLabel(room.name);
  const only = threadCalled(threads, thread);
  if (only === undefined) return { problem: words.noSuchThread(where, thread, threads) };
  if (Array.isArray(only)) return { problem: words.manyThreads(where, thread, only) };
  return {
    threadId: only.id,
    channelId: room.id,
    revision: only.revision,
    archived: only.archived,
    label: words.roomThreadLabel(only.name ?? only.id, room.name),
    here: only.id === current,
  };
}

function channelLabel(channel: Channel, selfId: string): string {
  if (channel.kind === "room") return words.theRoom(channel.name);
  const other = channel.members.find((m) => m.id !== selfId);
  return words.dmWith(other?.name ?? channel.name);
}

const firstPart = (written: string): string => written.split("/")[0]?.trim() ?? written;

function threadCalled(threads: readonly Thread[], wanted: string): Thread | Thread[] | undefined {
  const key = nameKey(wanted);
  const byId = threads.filter((candidate) => nameKey(candidate.id) === key);
  const matches = byId.length > 0 ? byId : threads.filter((candidate) => candidate.name !== null && nameKey(candidate.name) === key);
  const [only, ...others] = matches;
  return others.length > 0 ? matches : only;
}

function* splits(written: string): Generator<{ before: string; after: string }> {
  for (let end = written.length; end > 0; end = written.lastIndexOf("/", end - 1)) {
    yield { before: written.slice(0, end).trim(), after: written.slice(end + 1).trim() };
  }
}

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

function roomAndThread(rooms: readonly Channel[], written: string): { room: Channel; thread: string } | undefined {
  for (const { before, after } of splits(written)) {
    const room = findRoom(rooms, before);
    if (room !== undefined) return { room, thread: after };
  }
  return undefined;
}
