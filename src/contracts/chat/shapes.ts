import { arr, bool, int, lit, nul, num, obj, oneOf, type Static, str, union } from "@earendil-works/chord";
import { MEMBER_FIELDS } from "../gateway/index.ts";

/**
 * Someone who can be in a channel: you or an agent, named as the gateway's
 * roster names them, by an ID that never changes and a name that can. Whether
 * one is an admin is the roster's to say, so chat never keeps it.
 */
export const MemberSchema = obj(MEMBER_FIELDS);
export type Member = Static<typeof MemberSchema>;

/** A member at work in a thread, such as an agent from picking a message up until its turn settles. */
export const WorkingSchema = obj({
  memberId: str(),
  /** When it started, in milliseconds since the epoch. */
  since: num(),
});
export type Working = Static<typeof WorkingSchema>;

/**
 * Characters one message can hold. It is far above any ordinary answer; an
 * agent whose answer is longer posts it in parts.
 */
export const MAX_MESSAGE_LENGTH = 400_000;

/**
 * Characters a receipt's detail can hold. It is a short reason a person can
 * read, and an agent with a longer one shortens it.
 */
export const MAX_RECEIPT_DETAIL_LENGTH = 500;

const StatusSchema = oneOf("answered", "silent", "stopped", "skipped", "failed");

/** What one agent did with an event, left when its turn for that event ended. */
const ReceiptSchema = obj({
  memberId: str(),
  /**
   * The ID of the event it answers: the post, or an edit, or whatever else the
   * agent took up. A message edited after it was answered has a receipt for
   * the post and another for the edit, and they name different events.
   */
  event: str(),
  status: StatusSchema,
  /** The ID of the message that answers it, when the status is `answered`; otherwise null. */
  reply: union([str(), nul()]),
  /**
   * A short reason a person can read. A failed receipt always has one: why the
   * turn failed. A skipped receipt has one when the turn ahead of it failed,
   * saying why, and none when work was stopped. Any other receipt has null.
   */
  detail: union([str(), nul()]),
});
export type Receipt = Static<typeof ReceiptSchema>;

/**
 * What an agent leaves on events with `leaveReceipt`: a receipt without who
 * left it, which is the caller, and without the event, which is each one named.
 */
export const LeftReceiptSchema = obj({ status: StatusSchema, reply: union([str(), nul()]), detail: union([str(), nul()]) });
export type LeftReceipt = Static<typeof LeftReceiptSchema>;

/** One emoji on a message, and the members who put it there, in the order they did. */
const ReactionSchema = obj({ emoji: str(), memberIds: arr(str()) });
export type Reaction = Static<typeof ReactionSchema>;

/** A message as it now stands: the log of events folded into one record. */
export const MessageSchema = obj({
  id: str(),
  /**
   * The position of the event that posted it, in the whole store's order.
   * Messages are ordered and paged by it.
   */
  seq: int(),
  /** The ID of the event that posted it: the one a receipt names when an agent answers the message as first written. */
  event: str(),
  channelId: str(),
  threadId: str(),
  author: MemberSchema,
  /** What it says now: its latest edit, or nothing once it is deleted. */
  text: str(),
  sentAt: num(),
  /** When it was last edited, or null if it never was. */
  editedAt: union([num(), nul()]),
  /** A deleted message keeps its place in the thread and has lost its text and its reactions. */
  deleted: bool(),
  /**
   * IDs of the members the text names as `@name`, and of everyone in the
   * channel but the author when it says `@all`, in the channel's order of
   * members, as the members were when the message was written or last edited.
   * Never its author. In a DM it is empty unless the text names the other
   * member.
   */
  mentions: arr(str()),
  /** The emoji on it, in the order each first appeared. */
  reactions: arr(ReactionSchema),
  /**
   * What each agent did with each event that names this message, in order of
   * event and then of member ID. Silent receipts are here like any other:
   * whether to show one is up to whoever draws the thread.
   */
  receipts: arr(ReceiptSchema),
});
export type Message = Static<typeof MessageSchema>;

/**
 * The message an event names, as it stands when the event is read: enough to
 * decide what the event means to a member without asking for the message.
 */
const MessageRefSchema = obj({
  id: str(),
  channelId: str(),
  threadId: str(),
  author: MemberSchema,
  sentAt: num(),
  mentions: arr(str()),
  deleted: bool(),
  /** The start of its text on one line, or nothing once it is deleted. */
  preview: str(),
});
export type MessageRef = Static<typeof MessageRefSchema>;

const EVENT_BASE = {
  /**
   * The event's own name. Positions start again in a chat store that was
   * replaced, and IDs do not repeat, so this is what tells a new store's event
   * from an old one that has the same position.
   */
  id: str(),
  /** The event's position in the whole store's order, which never repeats. A member's place in its feed is one of these. */
  seq: int(),
  /** When it happened, in milliseconds since the epoch. */
  at: num(),
  /** Who did it. */
  actor: MemberSchema,
  /** The message it names. */
  message: MessageRefSchema,
  /**
   * What each agent did with this event, as it stands when the event is read,
   * in order of member ID. An agent that finds its own receipt here has dealt
   * with the event already.
   */
  receipts: arr(ReceiptSchema),
};

/**
 * One thing that happened to a message, in the order it did. The feed is a log
 * of these, and a message is what they add up to. An event carries what it
 * added: the text of a post or an edit, the emoji of a reaction, the receipt of
 * an agent. Once a message is deleted, its posts and edits carry no text: a
 * delete takes the text out of the log too.
 *
 * A `receipted` event is a receipt an agent left. Its `actor` is that agent, its
 * `message` is the one the answered event names, and the rest is the receipt:
 * `event` is the ID of the event it answers. A receipt that replaces an earlier
 * one on the same event is an event of its own, and the message shows the one
 * that stands. Nothing is left on a receipt's own event, so its `receipts` are
 * always empty.
 */
export const ChatEventSchema = union([
  obj({ ...EVENT_BASE, kind: lit("posted"), text: str() }),
  obj({ ...EVENT_BASE, kind: lit("edited"), text: str() }),
  obj({ ...EVENT_BASE, kind: lit("deleted") }),
  obj({ ...EVENT_BASE, kind: lit("reacted"), emoji: str() }),
  obj({ ...EVENT_BASE, kind: lit("unreacted"), emoji: str() }),
  obj({
    ...EVENT_BASE,
    kind: lit("receipted"),
    event: str(),
    status: StatusSchema,
    reply: union([str(), nul()]),
    detail: union([str(), nul()]),
  }),
]);
export type ChatEvent = Static<typeof ChatEventSchema>;
