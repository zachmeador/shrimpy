import { type Context, defineService, type ReplicatedState } from "@earendil-works/chord";
import type { Channel, Member, Message, Thread, ThreadView } from "./view.ts";

/**
 * Connection scope: everything a member does in chat. People's clients and
 * agents use the same service; an agent is a member like any other.
 */
export interface Chat {
  /**
   * Say who this connection is, before anything else. On one machine the chat
   * server takes the caller's word; a gateway verifies it once access crosses
   * machines.
   */
  identify(member: Member, context: Context): Promise<void>;

  /** The channels the caller belongs to. */
  channels(context: Context): Promise<Channel[]>;
  /** The DM between the caller and `other`, created on first use. */
  openDm(other: Member, context: Context): Promise<Channel>;

  threads(channelId: string, context: Context): Promise<Thread[]>;
  createThread(channelId: string, name: string | null, context: Context): Promise<Thread>;
  renameThread(threadId: string, name: string, context: Context): Promise<Thread>;
  archiveThread(threadId: string, archived: boolean, context: Context): Promise<Thread>;

  /**
   * Post to a thread. A retry with the same `requestId` from the same member
   * returns the first message instead of posting twice.
   */
  post(threadId: string, text: string, requestId: string, context: Context): Promise<Message>;
  /** Up to `limit` messages older than `beforeSeq`, or the newest when it is null; oldest first. */
  read(
    threadId: string,
    beforeSeq: number | null,
    limit: number,
    context: Context,
  ): Promise<Message[]>;
  /** Record that the caller, an agent, had these messages waiting when its work was stopped. */
  markSkipped(messageIds: string[], context: Context): Promise<void>;

  /** The newest message position on the server. A member with no cursor starts here. */
  head(context: Context): Promise<number>;
  /**
   * Messages after `cursor` in every channel the caller belongs to, oldest
   * first, up to `limit`. Waits until there is at least one. This is how an
   * agent is offered messages: it asks, so the chat server never has to reach
   * an agent, and a restarted agent catches up from its own cursor.
   */
  feed(cursor: number, limit: number, context: Context): Promise<Message[]>;

  /** Watch one thread. A connection watches one at a time. */
  attach(threadId: string, context: Context): Promise<void>;
  detach(context: Context): Promise<void>;
}
export const Chat = defineService<Chat>("shrimpy.chat");

/** Thread scope: the live view of the attached thread. */
export interface ThreadService {
  readonly state: ReplicatedState<ThreadView>;
}
export const ThreadService = defineService<ThreadService>("shrimpy.chat.thread");
