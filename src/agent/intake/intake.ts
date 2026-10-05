import { type Backoff, backoff } from "../../lib/retry/index.ts";
import type { ChatLink } from "../links/index.ts";
import type { Admissions, Working } from "./events.ts";
import { readFeed } from "./feed.ts";
import { markWorking } from "./working.ts";

export interface IntakeOptions {
  /** The agent's way to chat. Intake does not know what is on the other end of it. */
  link: ChatLink;
  /** The agent's records and sessions: where it stands in the feed, and a way to take an event up. */
  admissions: Admissions;
  /** What the agent's sessions know of the events it took up and has not left a receipt on yet. */
  working: Working;
  /** Told of failures. */
  onError?: (error: Error) => void;
  /** The pauses after a failure. Tests shorten them. */
  backoff?: () => Backoff;
}

export interface Intake {
  /** Stop reading the feed. Events already taken up carry on. */
  stopTaking(): void;
  /**
   * Resolve once every event whose turn has ended has had its receipt left, or
   * `signal` aborts, or chat is lost: a reply cannot be told to chat that is not
   * there. A turn still running is not waited for.
   */
  drain(signal: AbortSignal): Promise<void>;
  /** Stop everything. */
  close(): Promise<void>;
}

/**
 * Take the events that wake the agent from chat's feed and admit them. Each
 * one becomes a task of its thread's session that follows it to its receipt,
 * so nothing here has to be repeated after a crash: the cursor moves in the
 * commit that creates the task. Events are named by their own IDs, which chat
 * does not reuse even when it starts again with an empty store. Chat is also
 * told which threads the agent is working in.
 */
export function startIntake(options: IntakeOptions): Intake {
  const { link, working } = options;
  const onError = (error: Error): void => options.onError?.(error);
  const taking = new AbortController();
  const closing = new AbortController();
  const stopMarking = markWorking(link, working, onError);
  const reading = readFeed({
    link,
    admissions: options.admissions,
    onError,
    stop: AbortSignal.any([taking.signal, closing.signal]),
    backoff: (options.backoff ?? backoff)(),
  });

  return {
    stopTaking: () => taking.abort(),
    async drain(signal) {
      const live = link.current();
      if (live === undefined) return;
      await working.untilTold(AbortSignal.any([signal, live.lost]));
    },
    async close() {
      closing.abort();
      stopMarking();
      await reading;
    },
  };
}
