import type { ChatClient, Member, Message } from "../../contracts/chat/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import { type ChatLink, isRefusal } from "../links/index.ts";
import { pause } from "./pause.ts";
import type { Turns } from "./turns.ts";

/** Messages asked for at a time. */
const FEED_LIMIT = 50;

/**
 * Whether a message starts a turn. Today a message does when it is addressed to
 * the agent, which in a DM is every message from the other member. The agent's
 * own messages come back in its feed and are never one. Neither is a message
 * that already carries the agent's receipt: it was dealt with, perhaps by an
 * agent of this name that has lost its records since. Rooms and the agent's
 * own wake policy come later and belong here.
 */
export function wakes(self: Member, message: Message): boolean {
  if (message.author.id === self.id || !message.addressed.includes(self.id)) return false;
  return !message.receipts.some((receipt) => receipt.memberId === self.id);
}

export interface FeedOptions {
  self: Member;
  link: ChatLink;
  turns: Turns;
  /** Take a message that wakes the agent. The agent's place in the feed moves past it only once this returns. */
  admit(message: Message): Promise<void>;
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
 */
export async function readFeed(options: FeedOptions): Promise<void> {
  const { self, link, turns, stop } = options;
  const stopped = (): boolean => stop.aborted;
  const pauses = options.backoff ?? backoff();
  let loaded = false;
  // Where the agent stands in the feed, and what its records hold.
  let cursor: number | undefined;
  let stored: number | undefined;

  const moveTo = async (seq: number): Promise<number> => {
    cursor = seq;
    if (seq !== stored) {
      await turns.setCursor(seq);
      stored = seq;
    }
    return seq;
  };

  const follow = async (chat: ChatClient, signal: AbortSignal): Promise<void> => {
    let at = cursor ?? 0;
    for (;;) {
      let messages: Message[];
      try {
        messages = await chat.feed(at, FEED_LIMIT, signal);
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
      for (const message of messages) {
        if (wakes(self, message)) {
          await options.admit(message);
          at = await moveTo(message.seq);
        } else {
          at = message.seq;
        }
      }
      at = await moveTo(at);
    }
  };

  while (!stopped()) {
    try {
      if (!loaded) {
        cursor = stored = await turns.cursor();
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
