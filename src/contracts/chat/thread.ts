import { arr, bool, evolve, int, method, nul, num, obj, opt, remote, type Static, str, union } from "@earendil-works/chord";
import { answerOf, chat, RefusedSchema } from "../gateway/index.ts";
import { MessageSchema, WorkingSchema } from "./shapes.ts";

const THREAD_FIELDS = {
  id: str(),
  channelId: str(),
  main: bool(),
  /** Null until someone names it; show `preview` instead. */
  name: union([str(), nul()]),
  /**
   * The start of the thread's first message that is still there and is not a
   * command for agents, as it now reads, or null when it has none. A thread
   * that was started with a command is named for the first thing said in it
   * after.
   */
  preview: union([str(), nul()]),
  archived: bool(),
  /**
   * When the thread last got a message, or was made if it has none, in
   * milliseconds since the epoch. Edits, deletes and reactions do not change it.
   */
  updatedAt: num(),
  /** Who is working in this thread right now, longest first. */
  working: arr(WorkingSchema),
};

/** A thread as the first three versions of `Thread`, and the first two of `Channel`, serve it, before it had a revision. */
export const ThreadSchemaV1 = obj(THREAD_FIELDS);

/** One conversation inside a channel, as a record. Every channel has a main thread. */
export const ThreadSchema = obj({
  ...THREAD_FIELDS,
  /** How many times the thread has been renamed, archived or brought back, from 0. `Thread`'s `rename` and `archive` name it. */
  revision: int(),
});

/**
 * A thread as a record. The object a client holds to follow a thread and talk
 * in it is the value `Thread`.
 */
export type Thread = Static<typeof ThreadSchema>;

/** `Thread` as it was first served, before read marks. */
const ThreadV1 = remote("shrimpy.chat.thread", {
  version: 1,
  params: { thread: str() },
  hostAddress: () => chat(),
  variants: {
    all: {
      state: {
        /** Null, or why the caller can't have this thread. */
        refusal: union([RefusedSchema, nul()]),
        /** The thread, with who is working in it. */
        thread: union([ThreadSchemaV1, nul()]),
        /** Its newest messages, oldest first: at most 200, and fewer when they are very long. */
        messages: arr(MessageSchema),
        /** How many older messages there are, which `read` gives. */
        earlier: int(),
        /** Whether the caller only reads it, as you read a channel you aren't in. */
        readOnly: bool(),
      },
      methods: {
        /** Up to `limit` messages older than the position `before`, or the newest when it is null, oldest first. A page of very long ones holds fewer. */
        read: method(obj({ before: union([int(), nul()]), limit: int() }), answerOf(arr(MessageSchema))),
        /**
         * Posts a message of at most `MAX_MESSAGE_LENGTH` characters. A request
         * ID's first use wins: a retry from the same member answers with the
         * first message as it now stands, even if it was edited or deleted
         * since, and the same ID with another thread or text is refused. The
         * message records the members its text mentions.
         */
        post: method(obj({ text: str(), request: str() }), answerOf(MessageSchema)),
        /**
         * Changes what one of the caller's messages in this thread says, and
         * which members it mentions. A deleted message can't be edited. Editing
         * to the text it has changes nothing and adds no event.
         */
        edit: method(obj({ message: str(), text: str() }), answerOf(MessageSchema)),
        /**
         * Deletes one of the caller's messages in this thread. It keeps its
         * place and loses its text, its reactions and the text its earlier
         * events carried. Deleting it again changes nothing.
         */
        delete: method(obj({ message: str() }), answerOf(MessageSchema)),
        /** Puts one emoji on a message in this thread. The same emoji twice is one reaction. A deleted message takes none. */
        react: method(obj({ message: str(), emoji: str() }), answerOf(MessageSchema)),
        /** Takes the caller's emoji off a message in this thread. Taking one that isn't there changes nothing. */
        unreact: method(obj({ message: str(), emoji: str() }), answerOf(MessageSchema)),
        /** Names the thread, answering with it as it now stands. */
        rename: method(obj({ name: str() }), answerOf(ThreadSchemaV1)),
        /** Archives the thread, which hides it from lists and leaves it readable, or brings it back. */
        archive: method(obj({ archived: bool() }), answerOf(ThreadSchemaV1)),
      },
    },
  },
});

/** `Thread` as it was served with read marks, before a message could be sent quietly. */
const ThreadV2 = evolve(ThreadV1, (edit) =>
  edit
    /**
     * How many messages others wrote here after your read mark, or in the
     * whole thread while you have none, leaving out deleted ones. Your own
     * messages never count. Null for an agent, which keeps no read marks,
     * since its place in its feed says what it has taken.
     */
    .addState("all", "unread", union([int(), nul()]))
    /**
     * Moves your read mark up to a message in this thread, such as the newest
     * one on show. A mark only moves forward, so a message at or before it
     * changes nothing. Only you keep read marks, and an agent is refused.
     */
    .addMethod("all", "markRead", obj({ message: str() }), answerOf(nul())),
);

/** `Thread` as it was served with quiet posts, before a thread had a revision. */
const ThreadV3 = evolve(ThreadV2, (edit) =>
  /**
   * Posts a message of at most `MAX_MESSAGE_LENGTH` characters. A request ID's
   * first use wins: a retry from the same member answers with the first
   * message as it now stands, even if it was edited or deleted since, and the
   * same ID with another thread or text is refused. The message records the
   * members its text mentions. A message sent with `quiet` is never told to
   * you on your devices.
   */
  edit.args("post", obj({ text: str(), request: str(), quiet: opt(bool()) })),
);

/**
 * One thread as the caller sees it, at `chat()`: its newest messages, kept
 * live, older ones a page at a time, how many are new to you, and what a member
 * does in it. Holding it is what attaching to a thread was.
 *
 * `refusal` is null, or why the caller can't have this thread, and then the
 * rest of its state is empty and every method answers with that refusal. An
 * agent has only the threads of its own channels, and to an agent a thread that
 * doesn't exist and one in a channel it isn't in look the same. You read every
 * thread, and in a channel you aren't in, `readOnly` is true and every write is
 * refused.
 *
 * Chat keeps a read mark for you in each thread: the last message you have seen
 * there, which a client moves while the thread is on show. Every client of
 * yours counts from the same mark. A message that stays new to you for a few
 * seconds can be told to you on your devices.
 *
 * A rename or an archive names the thread's revision it was decided on, and
 * is refused once the thread has moved on from it, so that a stale retry can't
 * undo a later decision.
 */
export const Thread = evolve(ThreadV3, (edit) =>
  edit
    /** The thread, with its revision and who is working in it. */
    .state("all", "thread", union([ThreadSchema, nul()]))
    /** Names the thread, answering with it as it now stands. Naming it what it is called already changes nothing. */
    .method("rename", obj({ name: str(), revision: int() }), answerOf(ThreadSchema))
    /**
     * Archives the thread, which hides it from lists and leaves it readable,
     * or brings it back, answering with it as it now stands. Asking for what
     * it is already changes nothing.
     */
    .method("archive", obj({ archived: bool(), revision: int() }), answerOf(ThreadSchema)),
);
