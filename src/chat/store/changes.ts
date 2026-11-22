/**
 * Something that became visible when a transaction committed. Watchers read
 * again what they care about; the change only says where to look.
 */
export type Change =
  /** An event was added to the log, in a thread. */
  | { kind: "event"; channelId: string; threadId: string }
  /** Something about a thread itself changed: it was made, renamed or archived, or a member in its channel was renamed. */
  | { kind: "thread"; channelId: string; threadId: string }
  /** A channel was made, gained members, or one of its members was renamed. */
  | { kind: "channel"; channelId: string }
  /** A member's read mark in a thread moved forward. */
  | { kind: "read"; memberId: string; channelId: string; threadId: string };

export type ReportChange = (change: Change) => void;
