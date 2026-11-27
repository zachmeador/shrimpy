import { arr, bool, int, method, nul, obj, opt, remote, str, union } from "@earendil-works/chord";
import { answerOf, chat } from "../gateway/index.ts";
import { ChannelSchema } from "./channel.ts";
import { ChatEventSchema, LeftReceiptSchema, MemberSchema, MessageSchema, SearchHitSchema, WakeLineInputSchema } from "./shapes.ts";
import { ThreadSchema } from "./thread.ts";

/**
 * The caller as a member of chat, at `chat()`: whom chat takes it for, its
 * channels and the ones it only reads, and where its feed ends, all kept live,
 * with everything a member does in chat, each naming the channel, thread or
 * message it acts on. The relay says who is asking, so nobody comes in first. A
 * program that is no member gets nothing here, and its calls are refused.
 *
 * A member writes only in the channels it is in. You and any admin read every
 * channel, and a write in one you aren't in is refused, but for adding members
 * and pinning, which an admin does in any channel. A non-admin agent has only
 * its own channels, and to it a channel, thread or message that doesn't exist
 * and one it can't reach look the same.
 *
 * Each change to a message carries a request ID, as a post does, and its first
 * use wins: a retry from the same member answers with the message as it now
 * stands and changes nothing, so a replayed old change can't undo a newer one,
 * and the same ID asking for anything else is refused. A rename, an archive or
 * a pin names the thread's revision it was decided on, and is refused once the
 * thread has moved on from it, so that a stale retry can't undo a later
 * decision. A thread that already is what it asks is answered as it stands,
 * whatever revision it names, so a retry whose answer was lost goes through.
 */
export const Chat = remote("shrimpy.chat", {
  version: 3,
  params: {},
  hostAddress: () => chat(),
  variants: {
    all: {
      state: {
        /** Whom chat takes the caller for, by the roster's name, or null for a program that is no member. */
        you: union([MemberSchema, nul()]),
        /** The caller's channels, oldest first. */
        channels: arr(ChannelSchema),
        /** The channels the caller reads and isn't in, oldest first: every other one for you and any admin, none for a non-admin agent. */
        readOnlyChannels: arr(ChannelSchema),
        /**
         * The position of the newest event in the caller's channels, or 0. In
         * each channel only the events after the caller joined it count.
         */
        head: int(),
        /**
         * The chat store's ID, made with it and never changed. Positions start
         * again in a new store, so a caller that kept a place in its feed can
         * tell with this whether the place is for this store.
         */
        store: str(),
      },
      methods: {
        /**
         * Up to `limit` events after the position `after` in the caller's
         * channels, oldest first, or fewer when they are very long, at once,
         * and maybe none. Every event is there, the caller's own included, and
         * in each channel only those after the caller joined it: none from a
         * channel it only reads. An agent watches `head` and asks when it
         * passes its place. A position past `head` is refused.
         */
        events: method(obj({ after: int(), limit: int() }), answerOf(arr(ChatEventSchema))),
        /**
         * Leaves the caller's receipt on 1 to 200 events in its channels, all or
         * none. Only an agent leaves receipts, and never on a receipt's own
         * event. A later receipt replaces the caller's earlier one on an event,
         * and one that changes nothing writes nothing. Each receipt that does is
         * an event of its own, in the order the events were named.
         *
         * `reply` is required for `answered` and must be a message the caller
         * wrote in the same thread as each event's message; `detail` is required
         * for `failed` and may be given for `skipped` and `answered`, at most
         * `MAX_RECEIPT_DETAIL_LENGTH` characters. Each is null otherwise.
         */
        leaveReceipt: method(obj({ events: arr(str()), receipt: LeftReceiptSchema }), answerOf(nul())),
        /**
         * Marks the caller at work in a thread of its own channels, or not. The
         * mark lasts until the caller says otherwise or its hold on `Chat` ends,
         * as when its link drops, so a member that crashes never looks busy.
         */
        setWorking: method(obj({ thread: str(), working: bool() }), answerOf(nul())),
        /**
         * The DM between the caller and a member of the roster, made on first
         * use. It is made with no thread: a conversation starts with
         * `createThread`.
         */
        openDm: method(obj({ member: str() }), answerOf(ChannelSchema)),
        /**
         * Makes a room with the caller and up to 200 members of the roster in
         * it, and one thread, pinned. Only an admin. A name is one line of 1 to
         * 200 characters, and no other room has it, whatever the case.
         */
        createRoom: method(obj({ name: str(), members: arr(str()) }), answerOf(ChannelSchema)),
        /** A new thread in a channel, named or not. */
        createThread: method(obj({ channel: str(), name: union([str(), nul()]) }), answerOf(ThreadSchema)),
        /**
         * Adds 1 to 200 members of the roster to a room, answering with the
         * room as it now stands. Only an admin, in any room, yourself included,
         * which is how an admin walks into a room it only reads. A member who
         * is added is offered the room's events from then on, never what came
         * before. A DM takes no one.
         */
        addMembers: method(obj({ channel: str(), members: arr(str()) }), answerOf(ChannelSchema)),
        /**
         * Up to `limit` messages of a thread older than the position `before`,
         * or the newest when it is null, oldest first. A page of very long ones
         * holds fewer.
         */
        read: method(obj({ thread: str(), before: union([int(), nul()]), limit: int() }), answerOf(arr(MessageSchema))),
        /**
         * Up to `limit` messages of a thread centered around the position `seq`,
         * oldest first. Useful for expanding context around a search hit when
         * `seq` is sparse within a thread.
         */
        around: method(obj({ thread: str(), seq: int(), limit: int() }), answerOf(arr(MessageSchema))),
        /**
         * Search non-deleted messages matching `query` (case-insensitive terms,
         * with quoted phrases kept together) across channels the caller may
         * read, or scoped to one `channel` or `thread`. Returns newest hits
         * first, each with its thread's title.
         */
        search: method(
          obj({ query: str(), channel: opt(str()), thread: opt(str()), limit: opt(int()) }),
          answerOf(arr(SearchHitSchema)),
        ),
        /**
         * Posts a message of at most `MAX_MESSAGE_LENGTH` characters in a
         * thread. A request ID's first use wins: a retry from the same member
         * answers with the first message as it now stands, even if it was
         * edited or deleted since, and the same ID with another thread or text
         * is refused. The message records the members its text mentions. A
         * message sent with `quiet` is never told to you on your devices.
         */
        post: method(obj({ thread: str(), text: str(), request: str(), quiet: opt(bool()) }), answerOf(MessageSchema)),
        /**
         * Changes what one of the caller's messages says, and which members it
         * mentions. A deleted message can't be edited. Editing to the text it
         * has changes nothing and adds no event.
         */
        edit: method(obj({ message: str(), text: str(), request: str() }), answerOf(MessageSchema)),
        /**
         * Deletes one of the caller's messages. It keeps its place and loses
         * its text, its reactions and the text its earlier events carried.
         * Deleting it again changes nothing.
         */
        delete: method(obj({ message: str(), request: str() }), answerOf(MessageSchema)),
        /** Puts one emoji on a message. The same emoji twice is one reaction. A deleted message takes none. */
        react: method(obj({ message: str(), emoji: str(), request: str() }), answerOf(MessageSchema)),
        /** Takes the caller's emoji off a message. Taking one that isn't there changes nothing. */
        unreact: method(obj({ message: str(), emoji: str(), request: str() }), answerOf(MessageSchema)),
        /** Names a thread, answering with it as it now stands. Naming it what it is called already changes nothing. */
        rename: method(obj({ thread: str(), name: str(), revision: int() }), answerOf(ThreadSchema)),
        /**
         * Archives a thread, which hides it from lists and leaves it readable,
         * or brings it back, answering with it as it now stands. Asking for
         * what it is already changes nothing. A new message in an archived
         * thread, or a wake line, brings it back too.
         */
        archive: method(obj({ thread: str(), archived: bool(), revision: int() }), answerOf(ThreadSchema)),
        /**
         * Pins a thread in its channel, or unpins it, answering with it as it
         * now stands. The pin is the channel's, for every member. Asking for
         * what it is already changes nothing, and a pinned thread keeps when it
         * was pinned.
         */
        pin: method(obj({ thread: str(), pinned: bool(), revision: int() }), answerOf(ThreadSchema)),
        /**
         * Moves your read mark in a message's thread up to that message, such
         * as the newest one on show. A mark only moves forward, so a message at
         * or before it changes nothing. Only you keep read marks, and an agent
         * is refused.
         */
        markRead: method(obj({ message: str() }), answerOf(nul())),
        /**
         * Records a wake line in a thread — a trigger that fired, a background
         * command event, or a watched agent settling — answering with the
         * record. Only an agent writes wake lines. Text fields are at most
         * `MAX_WAKE_LINE_LENGTH` characters. A request ID's first use wins, as
         * for a post.
         */
        wakeLine: method(
          obj({ thread: str(), wake: WakeLineInputSchema, request: str() }),
          answerOf(MessageSchema),
        ),
      },
    },
  },
});
