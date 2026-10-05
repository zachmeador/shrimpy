import type { ChatEvent } from "../../contracts/chat/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { ChatLink, LiveChat } from "../links/index.ts";
import type { Admissions } from "./events.ts";
import { pause } from "./pause.ts";
import { takeUp } from "./wake.ts";

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
 */
export async function readFeed(options: FeedOptions): Promise<void> {
  const { link, admissions, stop } = options;
  const stopped = (): boolean => stop.aborted;
  const pauses = options.backoff ?? backoff();
  let loaded = false;
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
        const taken = takeUp(self, event);
        if (taken !== undefined) {
          // The agent's place in the feed moves in the commit that takes the event up.
          await admissions.admit(taken);
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
