import { type ChatEvent, type Member, type Message, READ_ONLY } from "../../contracts/chat/index.ts";
import { refuseNeedsAdmin } from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { identifier } from "../input/index.ts";
import type { ChannelRecord, ThreadRecord, Transaction } from "../store/index.ts";
import type { ChatDeps } from "./deps.ts";

export const isMember = (channel: ChannelRecord, memberId: string): boolean =>
  channel.members.some((member) => member.id === memberId);

/**
 * Whether the caller reads the channels it is not in. A person does: every
 * channel on the gateway is theirs to read. An agent, admin or not, reads only
 * the channels it is in.
 */
export const readsOthers = (caller: Member): boolean => caller.kind === "person";

const mayRead = (channel: ChannelRecord, caller: Member): boolean =>
  isMember(channel, caller.id) || readsOthers(caller);

// To an agent, a channel or thread that does not exist and one it is not in get
// the same refusal, so asking tells it nothing about channels it cannot see. A
// person reads every channel, so to them only what does not exist is unknown.

/** A channel the caller reads: one it is in, and for a person any other too. */
export function readableChannel(tx: Transaction, caller: Member, channelId: string): ChannelRecord {
  const channel = tx.channel(channelId);
  if (channel === undefined || !mayRead(channel, caller)) refuse(`Unknown channel: ${channelId}`);
  return channel;
}

/** A thread in a channel the caller reads, with that channel. */
export function readableThread(
  tx: Transaction,
  caller: Member,
  threadId: string,
): { thread: ThreadRecord; channel: ChannelRecord } {
  const thread = tx.thread(threadId);
  const channel = thread === undefined ? undefined : tx.channel(thread.channelId);
  if (thread === undefined || channel === undefined || !mayRead(channel, caller)) {
    refuse(`Unknown thread: ${threadId}`);
  }
  return { thread, channel };
}

// Everything below is for what writes, so it takes a member. A person who reads
// the channel and is not in it is refused, and told what would let them write.

/** Refuse unless the caller is in the channel. */
function requireMember(channel: ChannelRecord, caller: Member): void {
  if (isMember(channel, caller.id)) return;
  const room = channel.kind === "room";
  const names = channel.members.map((member) => member.name).toSorted((a, b) => a.localeCompare(b));
  const where = room ? `the room #${channel.name ?? ""}` : `the DM between ${names.join(" and ")}`;
  const how = room
    ? `To write there, add yourself: shrimpy rooms add "#${channel.name ?? ""}" ${caller.name}`
    : "A DM has two members and takes no more.";
  refuse(`You can read ${where} but you are not in it, so you can't write there. ${how}`, "service_not_allowed", READ_ONLY);
}

/** A channel the caller is in. */
export function visibleChannel(tx: Transaction, caller: Member, channelId: string): ChannelRecord {
  const channel = readableChannel(tx, caller, channelId);
  requireMember(channel, caller);
  return channel;
}

/** A thread in a channel the caller is in, with that channel. */
export function visibleThread(
  tx: Transaction,
  caller: Member,
  threadId: string,
): { thread: ThreadRecord; channel: ChannelRecord } {
  const found = readableThread(tx, caller, threadId);
  requireMember(found.channel, caller);
  return found;
}

/** A message in a channel the caller is in, with that channel. */
export function visibleMessage(
  tx: Transaction,
  caller: Member,
  messageId: string,
): { message: Message; channel: ChannelRecord } {
  const message = tx.message(messageId);
  const channel = message === undefined ? undefined : tx.channel(message.channelId);
  if (message === undefined || channel === undefined || !mayRead(channel, caller)) {
    refuse(`Unknown message: ${messageId}`);
  }
  requireMember(channel, caller);
  return { message, channel };
}

/** An event in a channel the caller is in. */
export function visibleEvent(tx: Transaction, caller: Member, eventId: string): ChatEvent {
  const event = tx.event(eventId);
  const channel = event === undefined ? undefined : tx.channel(event.message.channelId);
  if (event === undefined || channel === undefined || !mayRead(channel, caller)) {
    refuse(`Unknown event: ${eventId}`);
  }
  requireMember(channel, caller);
  return event;
}

/** Check that the caller may watch a thread, and give back its ID. */
export function watchableThread(deps: ChatDeps, caller: Member, threadId: unknown): string {
  const id = identifier(threadId, "threadId");
  deps.store.transaction((tx) => readableThread(tx, caller, id));
  return id;
}

export function threadExists(deps: ChatDeps, threadId: string): boolean {
  return deps.store.transaction((tx) => tx.thread(threadId) !== undefined);
}

/**
 * Refuse unless the caller is an admin, as the roster has it now and not as it
 * had it when the caller came in, so that a promotion counts at once. `what`
 * is what takes an admin, written to start a sentence.
 */
export async function requireAdmin(deps: ChatDeps, caller: Member, what: string): Promise<void> {
  const admins = await deps.identity.admins();
  if (!admins.some((admin) => admin.id === caller.id)) refuseNeedsAdmin(what, caller, admins);
}
