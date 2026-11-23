import { arr, bool, evolve, int, method, nul, obj, remote, str, union } from "@earendil-works/chord";
import { answerOf, chat } from "../gateway/index.ts";
import { ChannelSchema } from "./channel.ts";
import { ChatEventSchema, ChatEventSchemaV1, LeftReceiptSchema, MemberSchema } from "./shapes.ts";

/** `Chat` as it was first served, before a post or an edit in the feed carried the members it mentioned. */
const ChatV1 = remote("shrimpy.chat", {
  version: 1,
  params: {},
  hostAddress: () => chat(),
  variants: {
    all: {
      state: {
        /** Whom chat takes the caller for, by the roster's name, or null for a program that is no member. */
        you: union([MemberSchema, nul()]),
        /** The caller's channels, oldest first. */
        channels: arr(ChannelSchema),
        /** The channels the caller reads and isn't in, oldest first: every other one for you, none for an agent. */
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
        events: method(obj({ after: int(), limit: int() }), answerOf(arr(ChatEventSchemaV1))),
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
        /** The DM between the caller and a member of the roster, made on first use. */
        openDm: method(obj({ member: str() }), answerOf(ChannelSchema)),
        /**
         * Makes a room with the caller and up to 200 members of the roster in
         * it, and its main thread. Only an admin. A name is one line of 1 to 200
         * characters, and no other room has it, whatever the case.
         */
        createRoom: method(obj({ name: str(), members: arr(str()) }), answerOf(ChannelSchema)),
      },
    },
  },
});

/**
 * The caller as a member of chat, at `chat()`: whom chat takes it for, its
 * channels and the ones it only reads, and where its feed ends, all kept live,
 * with what a member does across channels. The relay says who is asking, so
 * nobody comes in first. A program that is no member gets nothing here, and its
 * calls are refused.
 */
export const Chat = evolve(ChatV1, (edit) =>
  /**
   * Up to `limit` events after the position `after` in the caller's channels,
   * oldest first, or fewer when they are very long, at once, and maybe none.
   * Every event is there, the caller's own included, and in each channel only
   * those after the caller joined it: none from a channel it only reads. An
   * agent watches `head` and asks when it passes its place. A position past
   * `head` is refused.
   */
  edit.result("events", answerOf(arr(ChatEventSchema))),
);
