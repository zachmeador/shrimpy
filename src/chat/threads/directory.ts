import type { Channel, Member, Thread } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { flag, identifier, label } from "../input/index.ts";
import type { ChannelRecord } from "../store/index.ts";
import { visibleChannel, visibleThread } from "./access.ts";
import type { ChatDeps } from "./deps.ts";
import { withWorking } from "./working.ts";

/** A channel as one of its members sees it: a DM is named for the other member. */
function toChannel(record: ChannelRecord, viewer: Member): Channel {
  const others = record.members.filter((member) => member.id !== viewer.id);
  return {
    id: record.id,
    kind: record.kind,
    name: record.name ?? others.map((member) => member.name).join(", "),
    members: record.members,
  };
}

export function listChannels(deps: ChatDeps, caller: Member): Channel[] {
  return deps.store.transaction((tx) =>
    tx.channelsOf(caller.id).map((record) => toChannel(record, caller)),
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

export function listThreads(deps: ChatDeps, caller: Member, channelId: unknown): Thread[] {
  const id = identifier(channelId, "channelId");
  return deps.store.transaction((tx) => {
    visibleChannel(tx, caller, id);
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
