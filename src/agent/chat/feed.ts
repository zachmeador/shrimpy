import { DEFAULT_WAKE_POLICY, type WakePolicy } from "../../contracts/agent/index.ts";
import { agentCommandIn, type Channel, type ChatEvent } from "../../contracts/chat/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { type Backoff, backoff, pause } from "../../lib/retry/index.ts";
import type { ChatLink, LiveChat } from "../links/index.ts";
import type { Admissions } from "./admissions.ts";
import { takeUpAnswer } from "./answer.ts";
import { commandFor, obey } from "./commands.ts";
import { inPlace } from "./place.ts";
import { resultOf, toWatch } from "./watches.ts";
import { withUnseen } from "./unseen.ts";
import { isUrgentPost, passedOver, wakingOf } from "./wake.ts";

/** Events asked for at a time. */
const FEED_LIMIT = 50;

export interface FeedOptions {
  link: ChatLink;
  admissions: Admissions;
  /** What wakes the agent in the room with this name, whatever the case. */
  wakeIn: (room: string) => WakePolicy;
  /** Told of failures, each time one ends an attempt to read. */
  onError(error: Error): void;
  /** Abort to stop reading. */
  stop: AbortSignal;
  /** The pauses after a failure. Tests shorten them. */
  backoff?: Backoff;
}

/**
 * Read the agent's feed from its own cursor until told to stop. With no cursor
 * it reads its channels from the start, so a message that was waiting before
 * the agent first connected is answered. The cursor is kept as it moves, with
 * the ID of the chat store it is in, so a restarted agent catches up from where
 * it stopped. Each time the agent connects it asks chat for its store's ID
 * before it reads: a cursor that was kept for another store means chat's store
 * was made anew, and the agent reads the new one from the start. A cursor the
 * chat server refuses as past the end, in the store it was kept for, means that
 * store went back to an earlier state, and the agent reads its log from the
 * start too. A failure is reported and followed by a pause. A connection that
 * chat cuts off is carried on over the next one, without a pause. A receipt that
 * says another member answered a message of the agent's own in a room is a
 * reason to ask chat for the reply it points to, which only chat can give. A
 * command that a person wrote is not taken up like the rest: it is acted on as
 * the feed brings it. So is what belongs to a question the agent asked another
 * agent: while the question is open, what that agent posts in the question's own
 * thread wakes nobody, and the receipt it leaves on the question closes it, in the
 * commit that moves the agent's place in the feed. A receipt that says it skipped
 * the question leaves it open.
 */
export async function readFeed(options: FeedOptions): Promise<void> {
  const { link, admissions, stop } = options;
  const stopped = (): boolean => stop.aborted;
  const reported = (error: Error): void => options.onError(error);
  const pauses = options.backoff ?? backoff();
  let loaded = false;
  /** What wakes the agent in a channel: the policy of its room, or the default where there is no room. */
  const policyIn = (channel: Channel | undefined): WakePolicy => (channel?.kind === "room" ? options.wakeIn(channel.name) : DEFAULT_WAKE_POLICY);
  // Where the agent stands in the feed, and what its records hold.
  let cursor: number | undefined;
  let stored: number | undefined;

  const moveTo = async (seq: number): Promise<number> => {
    cursor = seq;
    if (seq !== stored) {
      await admissions.setCursor(seq);
      stored = seq;
    }
    return seq;
  };

  const follow = async ({ chat, self }: LiveChat, signal: AbortSignal): Promise<void> => {
    // The agent's place in the feed is for the store it was kept with. In a store made anew the positions start again.
    if (await admissions.readingStore(chat.store())) {
      reported(new Error("Chat's store is not the one the agent's place in the feed was for, so the agent reads the new store from the start."));
      cursor = stored = 0;
    }
    let at = cursor ?? 0;
    /** The store went back to an earlier state: its log ends before the agent's place. */
    const wentBack = async (head: number): Promise<void> => {
      reported(
        new Error(
          `Chat's log ends at ${head}, before the agent's place in it at ${at}. ` +
            "The store is the same one, back at an earlier state, as when restored from a backup, so the agent reads its log from the start.",
        ),
      );
      at = await moveTo(0);
    };
    for (;;) {
      // Chat says where the agent's feed ends, live, and is asked for events once that is past the agent's place.
      const head = chat.head();
      if (head < at) {
        await wentBack(head);
        continue;
      }
      if (head === at) {
        await chat.untilHead(at, signal);
        continue;
      }
      let events: ChatEvent[];
      try {
        events = await chat.events(at, FEED_LIMIT, signal);
      } catch (error) {
        const now = isRefusal(error) ? chat.head() : at;
        // Any other refusal, or a failure of any other kind, is the next attempt's to report.
        if (now >= at) throw error;
        await wentBack(now);
        continue;
      }
      // A head past the agent's place with nothing after it waits for the head to move again.
      if (events.length === 0) {
        await chat.untilHead(Math.max(head, chat.head()), signal);
        continue;
      }
      for (const event of events) {
        // What the agent did itself is the most of what the feed offers it, and is passed over without asking chat anything.
        const passed = passedOver(self, event);
        // Where the event is. A channel that chat does not list is taken for a room.
        const channel = passed ? undefined : chat.channels().find((each) => each.id === event.message.channelId);
        const where = channel?.kind === "dm" ? "dm" : "room";
        // A command is acted on at once, ahead of anything queued, and goes no further: no wake policy turns it away, no
        // model reads it, and no session is handed it. The agent's place in the feed moves past it with the page.
        const command = passed ? undefined : commandFor(self, event, where);
        if (command !== undefined) {
          await obey(command, event, { chat, admissions, signal, onError: reported });
          at = event.seq;
          continue;
        }
        // A person's command that is for another agent, or for nobody, is no message for this one either: no model reads
        // a command as text, whoever it is for.
        if (!passed && event.kind === "posted" && event.actor.kind === "person" && agentCommandIn(event.text) !== undefined) {
          at = event.seq;
          continue;
        }
        // While a watch is open on an agent DM thread, posts/edits by that agent belong to the watch, and its receipt settles it.
        const watched = passed ? undefined : toWatch(event, await admissions.watches());
        if (watched !== undefined) {
          const result = watched.kind === "receipt" ? await resultOf(chat, watched.receipt, signal, reported) : undefined;
          if (watched.kind === "receipt" && result !== undefined) {
            await admissions.settleWatch(watched.watch.id, result, event.at, event.seq);
            cursor = stored = at = event.seq;
          } else {
            at = event.seq;
          }
          continue;
        }
        const policy = policyIn(channel);
        const waking = wakingOf(self, event, policy, where);
        const woken =
          waking?.kind === "answer"
            ? await takeUpAnswer(chat, self, policy, waking.receipt, waking.reply, signal, reported)
            : waking?.taken;
        if (woken !== undefined) {
          const context = { chat, self, looked: (threadId: string) => admissions.looked(threadId), signal, onError: reported };
          // The event comes with what was said before it that the agent has not seen, and where its thread is, and in a
          // room who each message was for.
          const taken = await inPlace(context, await withUnseen(context, event, woken));
          // A person's message is read by the turn that is running, at its next step, and not after it.
          const input = isUrgentPost(event) ? { ...taken, urgent: true as const } : taken;
          // The agent's place in the feed moves in the commit that takes the event up, to where the feed brought it.
          await admissions.admit(input, event.seq);
          cursor = stored = at = event.seq;
        } else {
          at = event.seq;
        }
      }
      at = await moveTo(at);
    }
  };

  while (!stopped()) {
    try {
      if (!loaded) {
        cursor = stored = await admissions.cursor();
        loaded = true;
      }
      await link.use(follow, stop);
    } catch (error) {
      if (stopped()) return;
      options.onError(asError(error));
      await pause(pauses.next(), stop);
    }
  }
}
