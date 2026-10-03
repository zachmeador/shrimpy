import type { Member } from "../../contracts/chat/index.ts";
import { identifier, refuse } from "../input/index.ts";
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

/** Check that the caller may watch a thread, and give back its ID. */
export function watchableThread(deps: ChatDeps, caller: Member, threadId: unknown): string {
  const id = identifier(threadId, "threadId");
  deps.store.transaction((tx) => visibleThread(tx, caller, id));
  return id;
}

export function threadExists(deps: ChatDeps, threadId: string): boolean {
  return deps.store.transaction((tx) => tx.thread(threadId) !== undefined);
}
