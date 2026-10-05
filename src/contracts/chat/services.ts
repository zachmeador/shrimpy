import { type Context, defineService, type ReplicatedState } from "@earendil-works/chord";
import type { Channel, ChatEvent, Member, Message, Receipt, Thread, ThreadView } from "./view.ts";

/**
 * Connection scope: everything a member does in chat. People's clients and
 * agents use the same service; an agent is a member like any other.
 */
export interface Chat {
  /**
   * Come in, before anything else, with a ticket the gateway made for the chat
   * server. Nobody says who they are: the chat server asks the gateway whose the
   * ticket is, and answers with the member the caller is, as the roster has it
   * now. A ticket works once, so a caller that is refused gets another. While
   * the chat server cannot reach the gateway it refuses to let anyone in, saying
   * so, and callers try again.
   */
  enter(ticket: string, context: Context): Promise<Member>;

  /** The channels the caller belongs to, oldest first. */
  channels(context: Context): Promise<Channel[]>;
  /**
   * The DM between the caller and the member `otherId`, created on first use. A
   * member the chat server has not met is looked up in the gateway's roster, and
   * one the roster does not have is refused.
   */
  openDm(otherId: string, context: Context): Promise<Channel>;
  /**
   * Make a room called `name`, with the caller and up to 200 more members,
   * `memberIds`, in it, and its main thread. A name is one line of 1 to 200
   * characters, and no other room has it, whatever the case. Anyone on the
   * roster may be a member: one the chat server has not met is looked up in the
   * gateway's roster. A name that is taken, or a member the roster does not
   * have, is refused, and nothing is made. The caller among `memberIds`, or a
   * member named twice, counts once. Answers with the room.
   */
  createRoom(name: string, memberIds: string[], context: Context): Promise<Channel>;
  /**
   * Add 1 to 200 members to a room the caller is in, by the same rules as
   * `createRoom`: anyone on the roster, and none is added if any is refused. A
   * member who is in the room already stays as they are. A member who is added
   * is offered the room's events from then on, and never what came before; the
   * room's threads, read, show it. A DM takes no one. Answers with the room as
   * it now stands.
   */
  addMembers(channelId: string, memberIds: string[], context: Context): Promise<Channel>;

  /** A channel's threads, archived ones too, the most recently updated first. */
  threads(channelId: string, context: Context): Promise<Thread[]>;
  createThread(channelId: string, name: string | null, context: Context): Promise<Thread>;
  renameThread(threadId: string, name: string, context: Context): Promise<Thread>;
  archiveThread(threadId: string, archived: boolean, context: Context): Promise<Thread>;

  /**
   * Post to a thread. A retry with the same `requestId` from the same member
   * returns the first message, as it stands now, instead of posting twice, even
   * if it has been edited or deleted since; the same `requestId` with a
   * different thread, text or `answers` is refused. A message holds at most
   * `MAX_MESSAGE_LENGTH` characters.
   *
   * Who the post is for follows from the channel. In a DM it is the other
   * member, whatever the text says. In a room it is the members the text
   * mentions as `@name`, matched as names are matched elsewhere, whatever the
   * case, and every member but the author when it says `@all`; a name that is
   * no member's is for nobody. `answers` is the ID of an event the post answers,
   * or null: the author of that event is for it too, if they are a member of
   * the room, and not the poster. The event must be in a channel the caller
   * belongs to. An edit works out who the message is for again, with the same
   * event.
   */
  post(
    threadId: string,
    text: string,
    requestId: string,
    answers: string | null,
    context: Context,
  ): Promise<Message>;
  /**
   * Change what a message says. Only its author may; for anyone else in the
   * channel the call is refused, and for someone outside it the message does
   * not exist. A deleted message cannot be edited. Editing to the text the
   * message already has changes nothing and adds no event, so a call whose
   * answer was lost can be made again. Who the message is for is worked out
   * again from the new text. Answers with the message as it now stands.
   */
  edit(messageId: string, text: string, context: Context): Promise<Message>;
  /**
   * Delete a message. Only its author may. It keeps its place in the thread and
   * loses its text, its reactions, and the text that its earlier events carried.
   * Deleting a deleted message changes nothing and adds no event. Answers with
   * the message as it now stands.
   */
  delete(messageId: string, context: Context): Promise<Message>;
  /**
   * Put an emoji on a message, as any member of the channel it is in. `emoji`
   * is one emoji. Reacting twice with the same emoji is one reaction, and the
   * second call changes nothing and adds no event. A deleted message takes no
   * reactions. Answers with the message as it now stands.
   */
  react(messageId: string, emoji: string, context: Context): Promise<Message>;
  /**
   * Take back the caller's own reaction. Taking back one that is not there
   * changes nothing and adds no event. Answers with the message as it now stands.
   */
  unreact(messageId: string, emoji: string, context: Context): Promise<Message>;
  /**
   * Messages as they now stand: up to `limit` of a thread older than
   * `beforeSeq`, or the newest when it is null; oldest first. A page of very
   * long messages holds fewer, the newest of them.
   */
  read(
    threadId: string,
    beforeSeq: number | null,
    limit: number,
    context: Context,
  ): Promise<Message[]>;
  /**
   * Leave the caller's receipt on 1 to 200 events: what it did with them, once
   * its turn for them ended. The receipt is `Receipt` without `memberId`, which
   * is the caller, and without `event`, which is each ID given. Only an agent
   * leaves receipts, only on events in channels it belongs to, and never on the
   * event of a receipt. The call is all or nothing. A later receipt from the
   * same agent replaces its earlier one on an event, so a skipped event can be
   * answered later, and leaving the receipt an event already has changes
   * nothing, so a call whose answer was lost can be made again.
   *
   * `reply` is required for `answered`, refused for every other status, and must
   * be a message the caller wrote in the same thread as the message each event
   * names. `detail` is required for `failed`, refused for every other status,
   * and holds at most `MAX_RECEIPT_DETAIL_LENGTH` characters.
   *
   * Each receipt that is new or differs from the one before is written as a
   * `receipted` event, in the order the IDs were given and in the same
   * transaction as the receipt, and `feed` offers it like any other event. A
   * receipt that changes nothing writes none. It changes the thread's live view,
   * but not its `updatedAt`.
   */
  leaveReceipt(
    eventIds: string[],
    receipt: Omit<Receipt, "memberId" | "event">,
    context: Context,
  ): Promise<void>;
  /**
   * Say whether the caller is working in a thread. The mark ends when this
   * connection does, so a member that crashes never looks busy forever.
   */
  setWorking(threadId: string, working: boolean, context: Context): Promise<void>;

  /** The position of the newest event on the server, or 0 when there is none. */
  head(context: Context): Promise<number>;
  /**
   * Events after `cursor` in every channel the caller belongs to, oldest
   * first, up to `limit`, or fewer when they are very long. In each channel,
   * only the events after the caller joined it: a room's earlier history is
   * read in its threads, never offered. Waits until there is at least one.
   * Every event is offered, the caller's own included, and what to do with each
   * is the caller's call: the chat server leaves nothing out. This is how an agent is offered what happens: it asks, so the chat
   * server never has to reach an agent, and a restarted agent catches up from
   * its own cursor. A cursor past `head` is refused.
   */
  feed(cursor: number, limit: number, context: Context): Promise<ChatEvent[]>;

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
