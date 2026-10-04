/**
 * Someone who can be in a channel: a person or an agent, as the gateway's
 * roster has them. The ID is the roster's and never changes. The name is the
 * roster's too, as the chat server last heard it, and it can change.
 */
export interface Member {
  id: string;
  kind: "person" | "agent";
  name: string;
}

/** A place where people and agents talk. */
export interface Channel {
  id: string;
  kind: "dm" | "room";
  /** A room's name, or in a DM the other member's name: what the caller calls it. */
  name: string;
  members: Member[];
}

/** A member at work in a thread, such as an agent from picking a message up until its turn settles. */
export interface Working {
  memberId: string;
  /** When it started, in milliseconds since the epoch. */
  since: number;
}

/** One conversation inside a channel. Every channel has a main thread. */
export interface Thread {
  id: string;
  channelId: string;
  main: boolean;
  /** Null until someone names it; show `preview` instead. */
  name: string | null;
  /** The start of the thread's first message that is still there, as it now reads, or null when it has none. */
  preview: string | null;
  archived: boolean;
  /**
   * When the thread last got a message, or was made if it has none, in
   * milliseconds since the epoch. Edits, deletes and reactions do not change it.
   */
  updatedAt: number;
  /** Who is working in this thread right now, longest first. */
  working: Working[];
}

/**
 * Characters one message can hold. It is far above any ordinary answer; an
 * agent whose answer is longer posts it in parts.
 */
export const MAX_MESSAGE_LENGTH = 400_000;

/**
 * Characters a failed receipt's detail can hold. It is a short reason a person
 * can read, and an agent with a longer one shortens it.
 */
export const MAX_RECEIPT_DETAIL_LENGTH = 500;

/** What one agent did with an event, left when its turn for that event ended. */
export interface Receipt {
  memberId: string;
  /**
   * The ID of the event it answers: the post, or an edit, or whatever else the
   * agent took up. A message edited after it was answered has a receipt for
   * the post and another for the edit, and they name different events.
   */
  event: string;
  status: "answered" | "silent" | "stopped" | "skipped" | "failed";
  /** The ID of the message that answers it, when the status is `answered`; otherwise null. */
  reply: string | null;
  /** A short reason a person can read, when the status is `failed`; otherwise null. */
  detail: string | null;
}

/** One emoji on a message, and the members who put it there, in the order they did. */
export interface Reaction {
  emoji: string;
  memberIds: string[];
}

/** A message as it now stands: the log of events folded into one record. */
export interface Message {
  id: string;
  /**
   * The position of the event that posted it, in the whole server's order.
   * Messages are ordered and paged by it. It is a feed cursor too: the feed
   * after it is everything that happened since the message was posted.
   */
  seq: number;
  /** The ID of the event that posted it: the one a receipt names when an agent answers the message as first written. */
  event: string;
  channelId: string;
  threadId: string;
  author: Member;
  /** What it says now: its latest edit, or nothing once it is deleted. */
  text: string;
  sentAt: number;
  /** When it was last edited, or null if it never was. */
  editedAt: number | null;
  /** A deleted message keeps its place in the thread and has lost its text and its reactions. */
  deleted: boolean;
  /** IDs of the members this message is meant for: the others in a DM, or those mentioned in a room. */
  addressed: string[];
  /** The emoji on it, in the order each first appeared. */
  reactions: Reaction[];
  /**
   * What each agent did with each event that names this message, in order of
   * event and then of member ID. Silent receipts are here like any other:
   * whether to show one is up to whoever draws the thread.
   */
  receipts: Receipt[];
}

/**
 * The message an event names, as it stands when the event is read: enough to
 * decide what the event means to a member without asking for the message.
 */
export type MessageRef = Pick<
  Message,
  "id" | "channelId" | "threadId" | "author" | "sentAt" | "addressed" | "deleted"
> & {
  /** The start of its text on one line, or nothing once it is deleted. */
  preview: string;
};

interface EventBase {
  /**
   * The event's own name. Positions start again in a chat store that was
   * replaced, and IDs do not repeat, so this is what tells a new store's event
   * from an old one that has the same position.
   */
  id: string;
  /** The event's position in the whole server's order, which never repeats. A member's feed cursor is one of these. */
  seq: number;
  /** When it happened, in milliseconds since the epoch. */
  at: number;
  /** Who did it. */
  actor: Member;
  /** The message it names. */
  message: MessageRef;
  /**
   * What each agent did with this event, as it stands when the event is read,
   * in order of member ID. An agent that finds its own receipt here has dealt
   * with the event already.
   */
  receipts: Receipt[];
}

/**
 * One thing that happened to a message, in the order it did. The feed is a log
 * of these, and a message is what they add up to. An event carries what it
 * added: the text of a post or an edit, the emoji of a reaction. Once a message
 * is deleted, its posts and edits carry no text: a delete takes the text out
 * of the log too.
 */
export type ChatEvent =
  | (EventBase & { kind: "posted"; text: string })
  | (EventBase & { kind: "edited"; text: string })
  | (EventBase & { kind: "deleted" })
  | (EventBase & { kind: "reacted"; emoji: string })
  | (EventBase & { kind: "unreacted"; emoji: string });

/**
 * A thread as clients show it. Values are strict JSON: absent facts are null,
 * never undefined.
 */
export interface ThreadView {
  thread: Thread;
  /** The newest messages, oldest first: at most 200, and fewer when they are very long. */
  messages: Message[];
  /** How many older messages exist beyond `messages`. */
  earlier: number;
}
