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
   * saying why, and none when work was stopped. An answered receipt has one when
   * the agent stopped unexpectedly during the turn and went on with it after
   * starting again, saying so. Any other receipt has null.
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

/**
 * Characters a wake line keeps of a trigger's prompt, a check's output, a
 * command, or a process's output tail. An agent cuts each to this, with an
 * ellipsis when it cuts.
 */
export const MAX_WAKE_LINE_LENGTH = 2_000;

/**
 * That one of an agent's triggers fired into a thread: its name (or null for a
 * one-time trigger), when it fired, in milliseconds since the epoch, its
 * prompt, and what its check printed, or the line that says the check failed,
 * or null for a trigger with no check.
 */
const TriggerWakeSchema = obj({
  kind: lit("trigger"),
  name: union([str(), nul()]),
  firedAt: num(),
  prompt: str(),
  output: union([str(), nul()]),
});

/**
 * That a background command an agent started exited, was killed, hit its
 * check-in, or was interrupted by a restart. `code` is the exit code when it
 * exited normally, or null otherwise.
 */
const ProcessWakeSchema = obj({
  kind: lit("process"),
  id: str(),
  command: str(),
  state: oneOf("exited", "killed", "checkin", "interrupted"),
  code: union([int(), nul()]),
  afterMs: int(),
  at: num(),
  output: union([str(), nul()]),
});

/** How a watched agent's turn in another DM thread settled. */
const AnswerStatusSchema = oneOf("answered", "silent", "stopped", "failed");

/**
 * That an agent waited on in another DM thread settled: who settled, which DM
 * thread and its title, how it settled, and when.
 */
const AnswerWakeSchema = obj({
  kind: lit("answer"),
  from: MemberSchema,
  thread: str(),
  title: str(),
  status: AnswerStatusSchema,
  at: num(),
});

/** What an agent passes to `Chat.wakeLine` for an answer line: chat resolves `from` and `title`. */
const AnswerWakeInputSchema = obj({
  kind: lit("answer"),
  from: str(),
  thread: str(),
  status: AnswerStatusSchema,
  at: num(),
});

/**
 * A wake line in a thread: what woke an agent without a chat message of
 * anyone's — a trigger that fired, a background command event, or a watched
 * agent settling in another thread.
 */
export const WakeLineSchema = union([TriggerWakeSchema, ProcessWakeSchema, AnswerWakeSchema]);
export type WakeLine = Static<typeof WakeLineSchema>;

/** What an agent sends to `Chat.wakeLine`. */
export const WakeLineInputSchema = union([TriggerWakeSchema, ProcessWakeSchema, AnswerWakeInputSchema]);
export type WakeLineInput = Static<typeof WakeLineInputSchema>;

/**
 * Bytes of files one message carries, all of them together, so also the most
 * one file can be: 25 MB.
 */
export const MAX_ATTACHED_BYTES = 25_000_000;

/** Files one message carries. */
export const MAX_ATTACHMENTS = 20;

/**
 * Bytes one piece of a file holds as it moves to or from chat. A file moves in
 * pieces, so no message on a link is big enough to hold the link up.
 */
export const PIECE_BYTES = 1024 * 1024;

/**
 * A file that came with a message: its ID, the name it was sent with, its media
 * type, its size in bytes, and for a picture its width and height in pixels, so
 * a client can lay it out before the bytes arrive, or null for anything else.
 * Chat knows a PNG, JPEG, GIF or WebP picture by its bytes, and gives it that
 * media type whatever the sender said.
 */
const AttachmentSchema = obj({
  id: str(),
  name: str(),
  mediaType: str(),
  size: int(),
  width: union([int(), nul()]),
  height: union([int(), nul()]),
});
export type Attachment = Static<typeof AttachmentSchema>;

/** Whether an attachment is a picture, which a client shows and a model can be shown: chat found its width and height. */
export const isPicture = (attachment: Attachment): boolean => attachment.width !== null && attachment.height !== null;

/** A file on its way to chat: the attachment it is to be, and how many of its bytes chat has. */
export const UploadSchema = obj({ attachment: str(), received: int() });
export type Upload = Static<typeof UploadSchema>;

/** One emoji on a message, and the members who put it there, in the order they did. */
const ReactionSchema = obj({ emoji: str(), memberIds: arr(str()) });
export type Reaction = Static<typeof ReactionSchema>;

/**
 * A message as it now stands: the log of events folded into one record. A
 * thread also holds wake lines, each a record of this shape with `wake` set,
 * written by the agent that was woken, with no text, no mentions and no
 * reactions. A wake line never counts as unread, wakes nobody, is told to
 * nobody's devices, and can't be edited, deleted or reacted to. The agent
 * leaves its receipt on the line's event, as on a message it took up.
 */
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
  /** The files that came with it, in the order they were sent, or none once it is deleted. */
  attachments: arr(AttachmentSchema),
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
  /** For a wake line, what woke the agent; null for a message. */
  wake: union([WakeLineSchema, nul()]),
  /**
   * What each agent did with each event that names this message, in order of
   * event and then of member ID. Silent receipts are here like any other:
   * whether to show one is up to whoever draws the thread.
   */
  receipts: arr(ReceiptSchema),
});
export type Message = Static<typeof MessageSchema>;

/** One message matched by `Chat.search`, with its thread's title when it has one. */
export const SearchHitSchema = obj({
  message: MessageSchema,
  threadName: union([str(), nul()]),
});
export type SearchHit = Static<typeof SearchHitSchema>;

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
  /** The files that came with it, as the message has them. */
  attachments: arr(AttachmentSchema),
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
 * added: the text of a post or an edit and the members it mentioned, the emoji
 * of a reaction, the receipt of an agent, the trigger that fired for a trigger's
 * line, and the files a post came with. Once a message is deleted, its posts and edits carry no text: a delete
 * takes the text out of the log too. A `fired` event makes a trigger's line, as
 * a post makes a message.
 *
 * The `mentions` of a post or an edit are the members its text mentioned then,
 * worked out as a message's are. Its `message` has the members the message
 * mentions now, which a later edit may have changed.
 *
 * A `receipted` event is a receipt an agent left. Its `actor` is that agent, its
 * `message` is the one the answered event names, and the rest is the receipt:
 * `event` is the ID of the event it answers. A receipt that replaces an earlier
 * one on the same event is an event of its own, and the message shows the one
 * that stands. Nothing is left on a receipt's own event, so its `receipts` are
 * always empty.
 */
export const ChatEventSchema = union([
  obj({ ...EVENT_BASE, kind: lit("posted"), text: str(), mentions: arr(str()), attachments: arr(AttachmentSchema) }),
  obj({ ...EVENT_BASE, kind: lit("edited"), text: str(), mentions: arr(str()) }),
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
  obj({ ...EVENT_BASE, kind: lit("fired"), wake: WakeLineSchema }),
]);
export type ChatEvent = Static<typeof ChatEventSchema>;
