import { type Channel, DM_TAKES_NO_MORE, type Member, type Thread } from "../../contracts/chat/index.ts";
import { noMember } from "../../contracts/gateway/index.ts";
import { flag, identifier, identifiers, label, MAX_MEMBERS, whole } from "../input/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import type { ChannelRecord, ThreadRecord, Transaction } from "../store/index.ts";
import { isMember, readableChannel, readableThread, readsOthers, requireAdmin, visibleChannel, visibleThread } from "./access.ts";
import type { ChatDeps } from "./deps.ts";
import { withWorking } from "./working.ts";

/**
 * A channel as its viewer sees it: a DM is named for the other member, or, when
 * the viewer is not in it, for both members, in alphabetical order.
 */
export function toChannel(record: ChannelRecord, viewer: Member): Channel {
  const others = record.members.filter((member) => member.id !== viewer.id);
  const named = others.map((member) => member.name).toSorted((a, b) => a.localeCompare(b));
  return {
    id: record.id,
    kind: record.kind,
    name: record.name ?? named.join(", "),
    members: record.members,
  };
}

/** The member the roster has with this ID, or a refusal that says there is none. */
function onRoster(deps: ChatDeps, id: string): Member {
  return deps.identity.member(id) ?? refuse(noMember(id));
}

/** The DM between the caller and another member of the roster, made on first use, with no thread. */
export function openDm(deps: ChatDeps, caller: Member, otherId: unknown): Channel {
  const id = identifier(otherId, "member");
  if (id === caller.id) refuse("A DM needs someone besides yourself.");
  const other = onRoster(deps, id);
  return deps.store.transaction((tx) => {
    tx.saveMember(other);
    const channel = tx.directChannel(caller.id, other.id) ?? tx.createDirectChannel(caller, other);
    return toChannel(channel, caller);
  });
}

/**
 * The members of the roster that `ids` name, with the caller and repeats left
 * out. One the roster does not have is refused, so a call that names one makes
 * and changes nothing.
 */
function membersOf(deps: ChatDeps, caller: Member, ids: string[]): Member[] {
  return [...new Set(ids)].filter((id) => id !== caller.id).map((id) => onRoster(deps, id));
}

/**
 * Make a room, with the caller and the members given in it, and one thread,
 * pinned. Only an admin may. The name is a name for display, and no other room
 * has it, whatever the case. Everything is checked before anything is made.
 */
export function createRoom(deps: ChatDeps, caller: Member, name: unknown, memberIds: unknown): Channel {
  requireAdmin(deps, caller, "Making a room");
  const title = label(name, "The room's name");
  const members = membersOf(deps, caller, identifiers(memberIds, "members", MAX_MEMBERS, 0));
  return deps.store.transaction((tx) => {
    if (tx.roomNamed(title) !== undefined) {
      refuse(`There is a room called "${title}" already. Room names are unique, whatever the case. Choose another.`);
    }
    for (const member of members) tx.saveMember(member);
    return toChannel(tx.createRoom(title, [caller, ...members], deps.now()), caller);
  });
}

/**
 * A room the caller can add members to: one it is in, and for any admin any
 * room, since a room an admin only reads is theirs to walk into. A DM is
 * refused: it has the two members and no more.
 */
function roomOf(tx: Transaction, deps: ChatDeps, caller: Member, channelId: string): ChannelRecord {
  const channel = readsOthers(deps, caller) ? readableChannel(tx, deps, caller, channelId) : visibleChannel(tx, deps, caller, channelId);
  if (channel.kind !== "room") refuse(`${DM_TAKES_NO_MORE} Make a room to talk with more.`);
  return channel;
}

/**
 * Add members to a room, as an admin: any room on the gateway, yourself
 * included. Whoever is added is offered the room's events from then on, and
 * one who is in already stays as they are.
 */
export function addMembers(deps: ChatDeps, caller: Member, channel: unknown, memberIds: unknown): Channel {
  const channelId = identifier(channel, "channel");
  const ids = identifiers(memberIds, "members", MAX_MEMBERS);
  // Someone who is not in the room is refused as if there were none, before being told it takes an admin.
  deps.store.transaction((tx) => roomOf(tx, deps, caller, channelId));
  requireAdmin(deps, caller, "Adding members to a room");
  const added = membersOf(deps, caller, ids);
  return deps.store.transaction((tx) => {
    const room = roomOf(tx, deps, caller, channelId);
    // An admin naming itself in a room it is not in walks into it, as anyone it names does.
    const joining = ids.includes(caller.id) && !isMember(room, caller.id) ? [...added, caller] : added;
    for (const member of joining) tx.saveMember(member);
    return toChannel(tx.addToChannel(channelId, joining), caller);
  });
}

export function createThread(deps: ChatDeps, caller: Member, channel: unknown, name: unknown): Thread {
  const channelId = identifier(channel, "channel");
  const title = name === null ? null : label(name, "The thread's name");
  return deps.store.transaction((tx) => {
    visibleChannel(tx, deps, caller, channelId);
    return withWorking(tx.addThread(channelId, title, deps.now()), deps.working);
  });
}

/**
 * Refuse a change the caller decided on the thread's revision `revision` once
 * the thread has moved on from it, so that a stale retry can't undo a later
 * rename, archive or pin. A thread that already is what the caller asks, by
 * `holds`, is let through, so a retry whose first answer was lost is answered
 * with it.
 */
function unchangedSince(thread: ThreadRecord, revision: number, holds: (thread: ThreadRecord) => boolean): void {
  if (thread.revision !== revision && !holds(thread)) {
    refuse(`The thread has changed since revision ${String(revision)}, and is at revision ${String(thread.revision)}. Look at it again first.`);
  }
}

/** Name a thread, as decided on its revision `revision`. Naming it what it is called already changes nothing. */
export function renameThread(deps: ChatDeps, caller: Member, thread: unknown, name: unknown, revision: unknown): Thread {
  const threadId = identifier(thread, "thread");
  const title = label(name, "The thread's name");
  const seen = whole(revision, "revision", 0);
  return deps.store.transaction((tx) => {
    unchangedSince(visibleThread(tx, deps, caller, threadId).thread, seen, (thread) => thread.name === title);
    return withWorking(tx.renameThread(threadId, title), deps.working);
  });
}

/**
 * Archive a thread or bring it back, as decided on its revision `revision`.
 * Archiving hides a thread from lists; it stays readable, and a new message in
 * it brings it back.
 */
export function archiveThread(deps: ChatDeps, caller: Member, thread: unknown, archived: unknown, revision: unknown): Thread {
  const threadId = identifier(thread, "thread");
  const hidden = flag(archived, "archived");
  const seen = whole(revision, "revision", 0);
  return deps.store.transaction((tx) => {
    unchangedSince(visibleThread(tx, deps, caller, threadId).thread, seen, (thread) => thread.archived === hidden);
    return withWorking(tx.archiveThread(threadId, hidden), deps.working);
  });
}

/**
 * Pin a thread in its channel or unpin it, as decided on its revision
 * `revision`. A member pins in a channel it is in, and any admin in any
 * channel, as an admin adds members to any room. A thread pinned already keeps
 * when it was.
 */
export function pinThread(deps: ChatDeps, caller: Member, thread: unknown, pinned: unknown, revision: unknown): Thread {
  const threadId = identifier(thread, "thread");
  const pin = flag(pinned, "pinned");
  const seen = whole(revision, "revision", 0);
  return deps.store.transaction((tx) => {
    const found = readsOthers(deps, caller) ? readableThread(tx, deps, caller, threadId) : visibleThread(tx, deps, caller, threadId);
    unchangedSince(found.thread, seen, (each) => (each.pinned !== null) === pin);
    return withWorking(tx.pinThread(threadId, pin ? deps.now() : null), deps.working);
  });
}

/**
 * Mark the caller as working in a thread, or clear that. `holder` stands for
 * the caller's hold of `Chat`, whose end clears the mark.
 */
export function setWorking(
  deps: ChatDeps,
  holder: string,
  caller: Member,
  threadId: unknown,
  working: unknown,
): null {
  const id = identifier(threadId, "thread");
  const mark = flag(working, "working");
  deps.store.transaction((tx) => visibleThread(tx, deps, caller, id));
  deps.working.set(holder, caller.id, id, mark, deps.now());
  return null;
}
