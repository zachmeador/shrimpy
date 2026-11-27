import {
  addToRoom,
  channelLabel,
  type ChatEvent,
  DM_TAKES_NO_MORE,
  type Member,
  type Message,
  roomLabel,
} from "../../contracts/chat/index.ts";
import { needsAdmin } from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import type { ChannelRecord, ThreadRecord, Transaction } from "../store/index.ts";
import type { ChatDeps } from "./deps.ts";

export const isMember = (channel: ChannelRecord, memberId: string): boolean =>
  channel.members.some((member) => member.id === memberId);

/** Whether the caller is an admin, as the roster has it now (every person is one). */
export const isAdmin = (deps: ChatDeps, caller: Member): boolean =>
  caller.kind === "person" || deps.identity.admins().some((admin) => admin.id === caller.id);

/**
 * Whether the caller reads the channels it is not in. You and any admin agent
 * do: every channel on the gateway is readable to an admin. A non-admin agent
 * reads only the channels it is in.
 */
export const readsOthers = (deps: ChatDeps, caller: Member): boolean => isAdmin(deps, caller);

const mayRead = (deps: ChatDeps, channel: ChannelRecord, caller: Member): boolean =>
  isMember(channel, caller.id) || readsOthers(deps, caller);

// To a non-admin agent, a channel or thread that does not exist and one it is
// not in get the same refusal, so asking tells it nothing about channels it
// cannot see. You and admin agents read every channel, so only what does not
// exist is unknown.

/** A channel the caller reads: one it is in, and for an admin any other too. */
export function readableChannel(tx: Transaction, deps: ChatDeps, caller: Member, channelId: string): ChannelRecord {
  const channel = tx.channel(channelId);
  if (channel === undefined || !mayRead(deps, channel, caller)) refuse(`Unknown channel: ${channelId}`);
  return channel;
}

/** A thread in a channel the caller reads, with that channel. */
export function readableThread(
  tx: Transaction,
  deps: ChatDeps,
  caller: Member,
  threadId: string,
): { thread: ThreadRecord; channel: ChannelRecord } {
  const thread = tx.thread(threadId);
  const channel = thread === undefined ? undefined : tx.channel(thread.channelId);
  if (thread === undefined || channel === undefined || !mayRead(deps, channel, caller)) {
    refuse(`Unknown thread: ${threadId}`);
  }
  return { thread, channel };
}

/** Whether the caller reads a thread: it is in the thread's channel, or reads every channel. */
export function readsThread(tx: Transaction, deps: ChatDeps, caller: Member, threadId: string): boolean {
  const thread = tx.thread(threadId);
  const channel = thread === undefined ? undefined : tx.channel(thread.channelId);
  return channel !== undefined && mayRead(deps, channel, caller);
}

// Everything below is for what writes, so it takes a member. An admin reading a
// channel it is not in is refused, and told what would let it write.

/** Refuse unless the caller is in the channel. */
function requireMember(channel: ChannelRecord, caller: Member): void {
  if (isMember(channel, caller.id)) return;
  const name = channel.name ?? "";
  const room = channel.kind === "room";
  const where = room ? `the room ${roomLabel(name)}` : `the ${channelLabel({ ...channel, name }, caller.id)}`;
  const how = room ? `To write there, add yourself: ${addToRoom(name, caller.name)}` : DM_TAKES_NO_MORE;
  refuse(`You can read ${where} but you are not in it, so you can't write there. ${how}`);
}

/** A channel the caller is in. */
export function visibleChannel(tx: Transaction, deps: ChatDeps, caller: Member, channelId: string): ChannelRecord {
  const channel = readableChannel(tx, deps, caller, channelId);
  requireMember(channel, caller);
  return channel;
}

/** A thread in a channel the caller is in, with that channel. */
export function visibleThread(
  tx: Transaction,
  deps: ChatDeps,
  caller: Member,
  threadId: string,
): { thread: ThreadRecord; channel: ChannelRecord } {
  const found = readableThread(tx, deps, caller, threadId);
  requireMember(found.channel, caller);
  return found;
}

/** A message in a channel the caller reads, with that channel. */
export function readableMessage(
  tx: Transaction,
  deps: ChatDeps,
  caller: Member,
  messageId: string,
): { message: Message; channel: ChannelRecord } {
  const message = tx.message(messageId);
  const channel = message === undefined ? undefined : tx.channel(message.channelId);
  if (message === undefined || channel === undefined || !mayRead(deps, channel, caller)) refuse(`Unknown message: ${messageId}`);
  return { message, channel };
}

/** A message in a channel the caller is in, with that channel. */
export function visibleMessage(
  tx: Transaction,
  deps: ChatDeps,
  caller: Member,
  messageId: string,
): { message: Message; channel: ChannelRecord } {
  const found = readableMessage(tx, deps, caller, messageId);
  requireMember(found.channel, caller);
  return found;
}

/** An event in a channel the caller is in. */
export function visibleEvent(tx: Transaction, deps: ChatDeps, caller: Member, eventId: string): ChatEvent {
  const event = tx.event(eventId);
  const channel = event === undefined ? undefined : tx.channel(event.message.channelId);
  if (event === undefined || channel === undefined || !mayRead(deps, channel, caller)) {
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
