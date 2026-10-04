/** Someone who can be in a channel: a person or an agent. */
export interface Member {
  /** Stable and unique, such as `person:zach` or `agent:shrimpy`. */
  id: string;
  kind: "person" | "agent";
  name: string;
}

/** The member an agent is in chat. Every program names an agent this way, so they agree on who it is. */
export function agentMember(name: string): Member {
  return { id: `agent:${name}`, kind: "agent", name };
}

/** The member a person is in chat. */
export function personMember(name: string): Member {
  return { id: `person:${name}`, kind: "person", name };
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
  /** The start of the thread's first message, or null when it is empty. */
  preview: string | null;
  archived: boolean;
  /** When the thread last got a message, or was made if it has none, in milliseconds since the epoch. */
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

/** What one agent did with a message, left when its turn for that message ended. */
export interface Receipt {
  memberId: string;
  status: "answered" | "silent" | "stopped" | "skipped" | "failed";
  /** The ID of the message that answers it, when the status is `answered`; otherwise null. */
  reply: string | null;
  /** A short reason a person can read, when the status is `failed`; otherwise null. */
  detail: string | null;
}

export interface Message {
  id: string;
  /** The message's position in the whole server's order. A member's feed cursor is one of these. */
  seq: number;
  channelId: string;
  threadId: string;
  author: Member;
  text: string;
  sentAt: number;
  /** IDs of the members this message is meant for: the others in a DM, or those mentioned in a room. */
  addressed: string[];
  /**
   * What each agent did with this message, in order of member ID. Silent
   * receipts are here like any other: whether to show one is up to whoever
   * draws the thread.
   */
  receipts: Receipt[];
}

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
