/** Someone who can be in a channel: a person or an agent. */
export interface Member {
  /** Stable and unique, such as `person:zach` or `agent:shrimpy`. */
  id: string;
  kind: "person" | "agent";
  name: string;
}

/** A place where people and agents talk. */
export interface Channel {
  id: string;
  kind: "dm" | "room";
  name: string;
  members: Member[];
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
  /** When the thread last got a message, in milliseconds since the epoch. */
  updatedAt: number;
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
  /** IDs of agents that had this message waiting when their work was stopped, and so did not act on it. */
  skippedBy: string[];
}

/**
 * A thread as clients show it. Values are strict JSON: absent facts are null,
 * never undefined.
 */
export interface ThreadView {
  thread: Thread;
  /** The newest messages, oldest first. */
  messages: Message[];
  /** How many older messages exist beyond `messages`. */
  earlier: number;
}
