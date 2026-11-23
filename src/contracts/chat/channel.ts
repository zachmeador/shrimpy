import { arr, evolve, int, map, method, nul, obj, oneOf, remote, type Static, str, union } from "@earendil-works/chord";
import { answerOf, chat, RefusedSchema } from "../gateway/index.ts";
import { MemberSchema } from "./shapes.ts";
import { ThreadSchema, ThreadSchemaV1 } from "./thread.ts";

/**
 * A place where you and agents talk, as a record: a DM, which has two members,
 * or a room, which has a name of its own and any number of them. Its members
 * write in it, and you read every channel.
 */
export const ChannelSchema = obj({
  id: str(),
  kind: oneOf("dm", "room"),
  /**
   * A room's name, or in a DM the other member's name: what the caller calls it.
   * In a DM the caller isn't in, the names of its two members, in alphabetical
   * order.
   */
  name: str(),
  /** In order of ID, so every member sees the same list. */
  members: arr(MemberSchema),
});

/**
 * A channel as a record. The object a client holds to follow a channel's
 * threads is the value `Channel`.
 */
export type Channel = Static<typeof ChannelSchema>;

/** `Channel` as it was first served, before read marks. */
const ChannelV1 = remote("shrimpy.chat.channel", {
  version: 1,
  params: { channel: str() },
  hostAddress: () => chat(),
  variants: {
    all: {
      state: {
        /** Null, or why the caller can't have this channel. */
        refusal: union([RefusedSchema, nul()]),
        /** The channel: its kind, name and members. */
        channel: union([ChannelSchema, nul()]),
        /** Its threads, archived ones too, the most recently updated first, each with who is working in it. */
        threads: arr(ThreadSchemaV1),
      },
      methods: {
        /** A new thread, named or not. */
        createThread: method(obj({ name: union([str(), nul()]) }), answerOf(ThreadSchemaV1)),
        /**
         * Adds 1 to 200 members of the roster to a room, answering with the
         * room as it now stands. Only an admin, in a room it is in, and you in
         * any room, yourself included, which is how you walk into one. A member
         * who is added is offered the room's events from then on, never what
         * came before. A DM takes no one.
         */
        addMembers: method(obj({ members: arr(str()) }), answerOf(ChannelSchema)),
      },
    },
  },
});

/** `Channel` as it was served with read marks, before a thread had a revision. */
const ChannelV2 = evolve(ChannelV1, (edit) =>
  /**
   * How many messages are new to you in each of its threads, by the thread's
   * ID, as `Thread`'s `unread` counts them: what is new in the channel is
   * their sum. Null for an agent, which keeps no read marks.
   */
  edit.addState("all", "unread", union([map(int()), nul()])),
);

/**
 * One channel as the caller sees it, at `chat()`: the channel and its threads,
 * kept live, how many messages in each are new to you, and what a member does
 * with it.
 *
 * `refusal` is null, or why the caller can't have this channel, and then the
 * rest of its state is empty and every method answers with that refusal. An
 * agent has only its own channels, and to an agent a channel that doesn't exist
 * and one it isn't in look the same. You read every channel, and a write in one
 * you aren't in is refused, but for adding members.
 */
export const Channel = evolve(ChannelV2, (edit) =>
  edit
    /** Its threads, archived ones too, the most recently updated first, each with its revision and who is working in it. */
    .state("all", "threads", arr(ThreadSchema))
    /** A new thread, named or not. */
    .result("createThread", answerOf(ThreadSchema)),
);
