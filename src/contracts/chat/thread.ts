import { arr, bool, int, nul, num, obj, remote, type Static, str, union } from "@earendil-works/chord";
import { chat, RefusedSchema } from "../gateway/index.ts";
import { MessageSchema, WorkingSchema } from "./shapes.ts";

/** One conversation inside a channel, as a record. */
export const ThreadSchema = obj({
  id: str(),
  channelId: str(),
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
   * When the thread was pinned in its channel, in milliseconds since the
   * epoch, or null. A pin is the channel's, so every member sees it, and a
   * channel lists its pinned threads first, oldest pin first.
   */
  pinned: union([num(), nul()]),
  /**
   * How many times the thread has been renamed, archived, brought back, pinned
   * or unpinned, from 0. `Chat`'s `rename`, `archive` and `pin` name it.
   */
  revision: int(),
  /**
   * When the thread last got a message, or was made if it has none, in
   * milliseconds since the epoch. Edits, deletes and reactions do not change it.
   */
  updatedAt: num(),
  /** Who is working in this thread right now, longest first. */
  working: arr(WorkingSchema),
});

/**
 * A thread as a record. The object a client holds to follow a thread and talk
 * in it is the value `Thread`.
 */
export type Thread = Static<typeof ThreadSchema>;

/**
 * One thread as the caller sees it, at `chat()`: its newest messages, kept
 * live, and how many are new to you. It is what a client holds to show a
 * thread, and holding it is what attaching to a thread was. What a member does
 * in it, reading older messages included, goes to `Chat`.
 *
 * `refusal` is null, or why the caller can't have this thread, and then the
 * rest of its state is empty. An agent has only the threads of its own
 * channels, and to an agent a thread that doesn't exist and one in a channel it
 * isn't in look the same. You read every thread, and in a channel you aren't
 * in, `readOnly` is true.
 *
 * Chat keeps a read mark for you in each thread: the last message you have seen
 * there, which a client moves while the thread is on show. Every client of
 * yours counts from the same mark. A message that stays new to you for a few
 * seconds can be told to you on your devices.
 */
export const Thread = remote("shrimpy.chat.thread", {
  version: 5,
  params: { thread: str() },
  hostAddress: () => chat(),
  variants: {
    all: {
      state: {
        /** Null, or why the caller can't have this thread. */
        refusal: union([RefusedSchema, nul()]),
        /** The thread, with its revision and who is working in it. */
        thread: union([ThreadSchema, nul()]),
        /** Its newest messages, oldest first: at most 200, and fewer when they are very long. */
        messages: arr(MessageSchema),
        /** How many older messages there are, which `Chat`'s `read` gives. */
        earlier: int(),
        /** Whether the caller only reads it, as you read a channel you aren't in. */
        readOnly: bool(),
        /**
         * How many messages others wrote here after your read mark, or in the
         * whole thread while you have none, leaving out deleted messages and
         * wake lines, and 0 while the thread is archived. Your own messages
         * never count. Null for an agent, which keeps no read marks, since its
         * place in its feed says what it has taken.
         */
        unread: union([int(), nul()]),
      },
    },
  },
});
