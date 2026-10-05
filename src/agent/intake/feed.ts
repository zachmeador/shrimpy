import type { ChatClient, ChatEvent } from "../../contracts/chat/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { ChatLink, LiveChat } from "../links/index.ts";
import { takeUpAnswer } from "./answer.ts";
import { knownChannels } from "./channels.ts";
import type { Admissions } from "./events.ts";
import { pause } from "./pause.ts";
import { DEFAULT_WAKE_POLICY, type WakePolicy } from "./policy.ts";
import { inRoom } from "./room.ts";
import { isUrgentPost, passedOver, takeUp } from "./wake.ts";

/** Events asked for at a time. */
const FEED_LIMIT = 50;

export interface FeedOptions {
  link: ChatLink;
  admissions: Admissions;
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
 * the agent first connected is answered. The cursor is kept as it moves, so a
 * restarted agent catches up from where it stopped; a cursor the chat server
 * refuses as past the end means its store was replaced, and the agent reads
 * the new log from the start. A failure is reported and followed by a pause. A
 * connection that chat cuts off is carried on over the next one, without a pause.
 * A receipt that says another member answered a message of the agent's own is a
 * reason to ask chat for the reply it points to, which only chat can give.
 */
export async function readFeed(options: FeedOptions): Promise<void> {
  const { link, admissions, stop } = options;
  const stopped = (): boolean => stop.aborted;
  const pauses = options.backoff ?? backoff();
  let loaded = false;
  const channels = knownChannels();
  /** What wakes the agent in the channel the event is in: the policy of its room, or the default where there is no room or no choice. */
  const policyOf = async (chat: ChatClient, event: ChatEvent, signal: AbortSignal): Promise<WakePolicy> => {
    const { wakes } = admissions;
    if (wakes === undefined || !wakes.anySet()) return DEFAULT_WAKE_POLICY;
    const channel = await channels.find(chat, event.message.channelId, signal);
    return channel?.kind === "room" ? wakes.of(channel.name) : DEFAULT_WAKE_POLICY;
  };
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
    let at = cursor ?? 0;
    for (;;) {
      let events: ChatEvent[];
      try {
        events = await chat.feed(at, FEED_LIMIT, signal);
      } catch (error) {
        const head = isRefusal(error) ? await chat.head(signal) : at;
        // Any other refusal, or a failure of any other kind, is the next attempt's to report.
        if (head >= at) throw error;
        options.onError(
          new Error(
            `Chat's log ends at ${head}, before the agent's place in it at ${at}. ` +
              "Its store was probably replaced, so the agent reads the new log from the start.",
          ),
        );
        at = await moveTo(0);
        continue;
      }
      for (const event of events) {
        // What the agent did itself is the most of what the feed offers it, and is passed over without asking chat anything.
        const policy = passedOver(self, event) ? DEFAULT_WAKE_POLICY : await policyOf(chat, event, signal);
        const waking = takeUp(self, event, policy);
        const reported = (error: Error): void => options.onError(error);
        const woken =
          waking?.kind === "answer"
            ? await takeUpAnswer(chat, self, policy, waking.receipt, waking.reply, signal, reported)
            : waking?.taken;
        if (woken !== undefined) {
          // In a room the event comes with what was said before it, and who each message was for.
          const taken = await inRoom(
            { chat, self, channels, looked: (threadId) => admissions.looked(threadId), signal, onError: reported },
            event,
            woken,
          );
          // A person's message that mentions the agent is read by the turn that is running, and not after it.
          const input = isUrgentPost(self, event, taken) ? { ...taken, urgent: true as const } : taken;
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
      options.onError(error instanceof Error ? error : new Error(String(error)));
      await pause(pauses.next(), stop);
    }
  }
}
