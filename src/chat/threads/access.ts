import { addToRoom, type ChatEvent, type Member, type Message, roomLabel } from "../../contracts/chat/index.ts";
import { needsAdmin } from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { listed } from "../../lib/text/index.ts";
import type { ChannelRecord, ThreadRecord, Transaction } from "../store/index.ts";
import type { ChatDeps } from "./deps.ts";

export const isMember = (channel: ChannelRecord, memberId: string): boolean =>
  channel.members.some((member) => member.id === memberId);

/**
 * Whether the caller reads the channels it is not in. You do: every channel on
 * the gateway is yours to read. An agent, admin or not, reads only the channels
 * it is in.
 */
export const readsOthers = (caller: Member): boolean => caller.kind === "person";

const mayRead = (channel: ChannelRecord, caller: Member): boolean =>
  isMember(channel, caller.id) || readsOthers(caller);

// To an agent, a channel or thread that does not exist and one it is not in get
// the same refusal, so asking tells it nothing about channels it cannot see. You
// read every channel, so to you only what does not exist is unknown.

/** A channel the caller reads: one it is in, and for you any other too. */
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

// Everything below is for what writes, so it takes a member. You, reading a
// channel you are not in, are refused, and told what would let you write.

/** Refuse unless the caller is in the channel. */
function requireMember(channel: ChannelRecord, caller: Member): void {
  if (isMember(channel, caller.id)) return;
  const room = channel.kind === "room";
  const names = channel.members.map((member) => member.name).toSorted((a, b) => a.localeCompare(b));
  const where = room ? `the room ${roomLabel(channel.name ?? "")}` : `the DM between ${listed(names)}`;
  const how = room ? `To write there, add yourself: ${addToRoom(channel.name ?? "", caller.name)}` : "A DM has two members and takes no more.";
  refuse(`You can read ${where} but you are not in it, so you can't write there. ${how}`);
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

/**
 * A message in `threadId`, a thread of a channel the caller is in, with that
 * channel. A message in another thread is unknown here.
 */
export function visibleMessage(
  tx: Transaction,
  caller: Member,
  threadId: string,
  messageId: string,
): { message: Message; channel: ChannelRecord } {
  const { channel } = readableThread(tx, caller, threadId);
  const message = tx.message(messageId);
  if (message?.threadId !== threadId) refuse(`Unknown message: ${messageId}`);
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

/**
 * Refuse unless the caller is an admin, as the roster has it now, so that a
 * promotion counts at once. `what` is what takes an admin, written to start a
 * sentence.
 */
export function requireAdmin(deps: ChatDeps, caller: Member, what: string): void {
  const admins = deps.identity.admins();
  if (!admins.some((admin) => admin.id === caller.id)) refuse(needsAdmin(what, caller, admins).words);
}
