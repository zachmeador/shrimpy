import type { Channel, Member, Thread } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { flag, identifier, identifiers, label, MAX_MEMBERS } from "../input/index.ts";
import type { ChannelRecord, Transaction } from "../store/index.ts";
import { isMember, readableChannel, readsOthers, requireAdmin, visibleChannel, visibleThread } from "./access.ts";
import type { ChatDeps } from "./deps.ts";
import { withWorking } from "./working.ts";

/**
 * A channel as its viewer sees it: a DM is named for the other member, or, when
 * the viewer is not in it, for both members, in alphabetical order.
 */
function toChannel(record: ChannelRecord, viewer: Member): Channel {
  const others = record.members.filter((member) => member.id !== viewer.id);
  const named = others.map((member) => member.name).toSorted((a, b) => a.localeCompare(b));
  return {
    id: record.id,
    kind: record.kind,
    name: record.name ?? named.join(", "),
    members: record.members,
  };
}

export function listChannels(deps: ChatDeps, caller: Member): Channel[] {
  return deps.store.transaction((tx) =>
    tx.channelsOf(caller.id).map((record) => toChannel(record, caller)),
  );
}

/**
 * The channels the caller reads and is not in. A person reads every channel
 * there is, so these are all the others. An agent reads only its own, so for an
 * agent there are none.
 */
export function listReadOnlyChannels(deps: ChatDeps, caller: Member): Channel[] {
  if (!readsOthers(caller)) return [];
  return deps.store.transaction((tx) =>
    tx.channelsWithout(caller.id).map((record) => toChannel(record, caller)),
  );
}

/**
 * The DM between the caller and another member, made on first use together with
 * its main thread. A member the store has not met yet is looked up in the
 * roster, and one the roster does not have is refused. One the store knows is
 * not asked about: it keeps what is on record, and its name is brought up to
 * date when it next comes in.
 */
export async function openDm(deps: ChatDeps, caller: Member, otherId: unknown): Promise<Channel> {
  const id = identifier(otherId, "other");
  if (id === caller.id) refuse("A DM needs someone besides yourself.");
  const met = deps.store.transaction((tx) => tx.member(id));
  const other = met ?? (await deps.identity.member(id)) ?? refuse(`There is no member ${id} on the roster.`);
  return deps.store.transaction((tx) => {
    tx.addMember(other);
    const channel =
      tx.directChannel(caller.id, other.id) ?? tx.createDirectChannel(caller, other, deps.now());
    return toChannel(channel, caller);
  });
}

/**
 * The members that `ids` name, as the store has them or else the roster does,
 * with the caller and repeats left out. One the roster does not have is
 * refused, so a call that names one makes and changes nothing.
 */
async function membersOf(deps: ChatDeps, caller: Member, ids: string[]): Promise<Member[]> {
  const wanted = [...new Set(ids)].filter((id) => id !== caller.id);
  const met = deps.store.transaction((tx) => wanted.map((id) => tx.member(id)));
  const members: Member[] = [];
  for (const [index, id] of wanted.entries()) {
    members.push(met[index] ?? (await deps.identity.member(id)) ?? refuse(`There is no member ${id} on the roster.`));
  }
  return members;
}

/**
 * Make a room, with the caller and the members given in it, and its main
 * thread. Only an admin may. The name is a name for display, and no other room
 * has it, whatever the case. Everything is checked before anything is made.
 */
export async function createRoom(deps: ChatDeps, caller: Member, name: unknown, memberIds: unknown): Promise<Channel> {
  await requireAdmin(deps, caller, "Making a room");
  const title = label(name, "The room's name");
  const members = await membersOf(deps, caller, identifiers(memberIds, "memberIds", MAX_MEMBERS, 0));
  return deps.store.transaction((tx) => {
    if (tx.roomNamed(title) !== undefined) {
      refuse(`There is a room called "${title}" already. Room names are unique, whatever the case. Choose another.`);
    }
    for (const member of members) tx.addMember(member);
    return toChannel(tx.createRoom(title, [caller, ...members], deps.now()), caller);
  });
}

/** A room the caller is in. A DM is refused: it has the two members and no more. */
/**
 * A room the caller can add members to: one it is in, and for the person any
 * room, since a room they only read is theirs to walk into. An agent adds only
 * to a room it is in.
 */
function roomOf(tx: Transaction, caller: Member, channelId: string): ChannelRecord {
  const channel = readsOthers(caller) ? readableChannel(tx, caller, channelId) : visibleChannel(tx, caller, channelId);
  if (channel.kind !== "room") refuse("A DM has two members and takes no more. Make a room to talk with more.");
  return channel;
}

/**
 * Add members to a room, as an admin: a room the caller is in, or for the
 * person any room, themselves included. Whoever is added is
 * offered the room's events from then on, and one who is in already stays as
 * they are.
 */
export async function addMembers(deps: ChatDeps, caller: Member, channelId: unknown, memberIds: unknown): Promise<Channel> {
  const id = identifier(channelId, "channelId");
  const ids = identifiers(memberIds, "memberIds", MAX_MEMBERS);
  // Someone who is not in the room is refused as if there were none, before the roster is asked anything.
  deps.store.transaction((tx) => roomOf(tx, caller, id));
  await requireAdmin(deps, caller, "Adding members to a room");
  const added = await membersOf(deps, caller, ids);
  return deps.store.transaction((tx) => {
    const room = roomOf(tx, caller, id);
    // The person who names themselves and is not in the room walks into it, as anyone they name does.
    const joining = ids.includes(caller.id) && !isMember(room, caller.id) ? [...added, caller] : added;
    for (const member of joining) tx.addMember(member);
    return toChannel(tx.addToChannel(id, joining), caller);
  });
}

/** The threads of a channel the caller reads, whether or not it is in it. */
export function listThreads(deps: ChatDeps, caller: Member, channelId: unknown): Thread[] {
  const id = identifier(channelId, "channelId");
  return deps.store.transaction((tx) => {
    readableChannel(tx, caller, id);
    return tx.threadsIn(id).map((record) => withWorking(record, deps.working));
  });
}

export function createThread(
  deps: ChatDeps,
  caller: Member,
  channelId: unknown,
  name: unknown,
): Thread {
  const id = identifier(channelId, "channelId");
  const title = name === null ? null : label(name, "name");
  return deps.store.transaction((tx) => {
    visibleChannel(tx, caller, id);
    return withWorking(tx.addThread(id, title, deps.now()), deps.working);
  });
}

export function renameThread(deps: ChatDeps, caller: Member, threadId: unknown, name: unknown): Thread {
  const id = identifier(threadId, "threadId");
  const title = label(name, "name");
  return deps.store.transaction((tx) => {
    visibleThread(tx, caller, id);
    return withWorking(tx.renameThread(id, title), deps.working);
  });
}

/** Archiving hides a thread from lists; it stays readable and can take messages. */
export function archiveThread(
  deps: ChatDeps,
  caller: Member,
  threadId: unknown,
  archived: unknown,
): Thread {
  const id = identifier(threadId, "threadId");
  const hidden = flag(archived, "archived");
  return deps.store.transaction((tx) => {
    visibleThread(tx, caller, id);
    return withWorking(tx.archiveThread(id, hidden), deps.working);
  });
}

/**
 * Mark the caller as working in a thread, or clear that. `connection` stands
 * for the caller's connection, whose end clears the mark.
 */
export function setWorking(
  deps: ChatDeps,
  connection: object,
  caller: Member,
  threadId: unknown,
  working: unknown,
): void {
  const id = identifier(threadId, "threadId");
  const mark = flag(working, "working");
  deps.store.transaction((tx) => visibleThread(tx, caller, id));
  deps.working.set(connection, caller.id, id, mark, deps.now());
}
