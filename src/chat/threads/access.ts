import type { ChatEvent, Member, Message } from "../../contracts/chat/index.ts";
import { refuseNeedsAdmin } from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { identifier } from "../input/index.ts";
import type { ChannelRecord, ThreadRecord, Transaction } from "../store/index.ts";
import type { ChatDeps } from "./deps.ts";

export const isMember = (channel: ChannelRecord, memberId: string): boolean =>
  channel.members.some((member) => member.id === memberId);

// A channel or thread that does not exist and one the caller is not in get the
// same refusal, so asking tells a caller nothing about channels it cannot see.

/** A channel the caller belongs to. */
export function visibleChannel(tx: Transaction, caller: Member, channelId: string): ChannelRecord {
  const channel = tx.channel(channelId);
  if (channel === undefined || !isMember(channel, caller.id)) refuse(`Unknown channel: ${channelId}`);
  return channel;
}

/** A thread in a channel the caller belongs to, with that channel. */
export function visibleThread(
  tx: Transaction,
  caller: Member,
  threadId: string,
): { thread: ThreadRecord; channel: ChannelRecord } {
  const thread = tx.thread(threadId);
  const channel = thread === undefined ? undefined : tx.channel(thread.channelId);
  if (thread === undefined || channel === undefined || !isMember(channel, caller.id)) {
    refuse(`Unknown thread: ${threadId}`);
  }
  return { thread, channel };
}

/** A message in a channel the caller belongs to, with that channel. */
export function visibleMessage(
  tx: Transaction,
  caller: Member,
  messageId: string,
): { message: Message; channel: ChannelRecord } {
  const message = tx.message(messageId);
  const channel = message === undefined ? undefined : tx.channel(message.channelId);
  if (message === undefined || channel === undefined || !isMember(channel, caller.id)) {
    refuse(`Unknown message: ${messageId}`);
  }
  return { message, channel };
}

/** An event in a channel the caller belongs to. */
export function visibleEvent(tx: Transaction, caller: Member, eventId: string): ChatEvent {
  const event = tx.event(eventId);
  const channel = event === undefined ? undefined : tx.channel(event.message.channelId);
  if (event === undefined || channel === undefined || !isMember(channel, caller.id)) {
    refuse(`Unknown event: ${eventId}`);
  }
  return event;
}

/** Check that the caller may watch a thread, and give back its ID. */
export function watchableThread(deps: ChatDeps, caller: Member, threadId: unknown): string {
  const id = identifier(threadId, "threadId");
  deps.store.transaction((tx) => visibleThread(tx, caller, id));
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
