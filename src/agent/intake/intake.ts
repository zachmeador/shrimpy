import { MAX_MESSAGE_LENGTH, type Member, type Message } from "../../contracts/chat/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import { type ChatLink, isRefusal } from "../links/index.ts";
import { deliver } from "./deliver.ts";
import { readFeed } from "./feed.ts";
import { pause, untilAborted } from "./pause.ts";
import { promptFor, snapshotOf } from "./prompt.ts";
import type { Outstanding, Turn, TurnOutcome, Turns } from "./turns.ts";
import { workingMarks } from "./working.ts";

export interface IntakeOptions {
  /** Who the agent is in chat. */
  self: Member;
  /** The agent's way to chat. Intake does not know what is on the other end of it. */
  link: ChatLink;
  /** The agent's sessions and records. */
  turns: Turns;
  /** Told of failures, and of replies chat refused. */
  onError?: (error: Error) => void;
  /** Characters in the longest message the agent posts; a longer answer is posted in parts. Tests shorten it. */
  messageLimit?: number;
  /** The pauses after a failure: one is made for each thing that retries. Tests shorten them. */
  backoff?: () => Backoff;
}

export interface Intake {
  /** Stop reading the feed. Turns already taken carry on, and their replies are still delivered. */
  stopTaking(): void;
  /** Resolve once every turn that has ended has been delivered, or `signal` aborts. A turn still running is not waited for. */
  drain(signal: AbortSignal): Promise<void>;
  /** Stop everything. Whatever was not delivered stays in the outbox for the next start. */
  close(): Promise<void>;
}

/** A message being followed from its turn to its receipt. */
interface Followed {
  outstanding: Outstanding;
  /** Resolves when its receipt is left and it is out of the outbox, or when following it stops. */
  done: Promise<void>;
  /** Whether its turn has ended, so that all that is left is to tell chat. */
  ended: boolean;
}

/**
 * Take the messages that wake the agent from chat's feed, hand each to its
 * session, and when its turn ends post the reply and leave the receipt. Each
 * step is safe to repeat after a crash: taking a message is recorded before it
 * is handed over, and the record is kept until the receipt is left, so after a
 * restart, or once chat comes back, whatever is unfinished is picked up again.
 */
export function startIntake(options: IntakeOptions): Intake {
  const { self, link, turns } = options;
  const onError = (error: Error): void => options.onError?.(error);
  const messageLimit = options.messageLimit ?? MAX_MESSAGE_LENGTH;
  const newBackoff = options.backoff ?? backoff;
  const closing = new AbortController();
  const closed = (): boolean => closing.signal.aborted;
  const taking = new AbortController();
  const followed = new Map<string, Followed>();
  /** Messages being handed over right now, so the outbox and the feed bringing up the same one hand it over once. */
  const handing = new Set<string>();
  const marks = workingMarks(link, onError);

  /** Record the message, hand it over, and follow it; the feed moves past it once this returns. */
  const admit = async (message: Message): Promise<void> => {
    const outstanding = await turns.record({
      message: snapshotOf(message),
      threadId: message.threadId,
      channelId: message.channelId,
    });
    // A message whose receipt was left before a crash needs nothing more.
    if (outstanding === undefined) return;
    await take(outstanding);
  };

  /** Hand a recorded message to its session and follow it. */
  async function take(outstanding: Outstanding): Promise<void> {
    const id = outstanding.message.id;
    if (handing.has(id) || followed.has(id)) return;
    handing.add(id);
    try {
      follow(outstanding, await turns.start(outstanding, promptFor(outstanding)));
    } finally {
      handing.delete(id);
    }
  }

  function follow(outstanding: Outstanding, turn: Turn): void {
    const id = outstanding.message.id;
    if (followed.has(id)) return;
    const state: Followed = { outstanding, ended: false, done: Promise.resolve() };
    marks.add(outstanding.threadId);
    state.done = finish(outstanding, turn, state)
      .catch((error: unknown) => {
        if (!closed()) onError(asError(error));
      })
      .finally(() => {
        followed.delete(id);
        marks.remove(outstanding.threadId);
      });
    followed.set(id, state);
  }

  async function finish(outstanding: Outstanding, turn: Turn, state: Followed): Promise<void> {
    await turn.ended(closing.signal);
    state.ended = true;
    const outcome = await turn.outcome();
    if (outcome.kind === "failed") await withdrawWaiting(outstanding);
    await tell(outstanding, outcome);
    await turns.settle(outstanding, outcome);
  }

  /**
   * A turn that failed ends its thread's queue. Nothing would start the
   * messages waiting behind it until someone wrote again, so they are taken
   * back: each is marked skipped and shown at the next turn in the thread.
   */
  async function withdrawWaiting(failed: Outstanding): Promise<void> {
    for (const entry of [...followed.values()]) {
      if (entry.ended || entry.outstanding.threadId !== failed.threadId) continue;
      if (entry.outstanding.message.id === failed.message.id) continue;
      await turns.withdraw(entry.outstanding);
    }
  }

  /** Tell chat how the turn ended. A failure is tried again after a pause, but what chat refuses for good is dropped. */
  async function tell(outstanding: Outstanding, outcome: TurnOutcome): Promise<void> {
    const pauses = newBackoff();
    for (;;) {
      try {
        await link.use((chat, signal) => deliver(chat, outstanding, outcome, messageLimit, signal), closing.signal);
        return;
      } catch (error) {
        if (closed()) throw error;
        if (isRefusal(error)) {
          onError(
            new Error(
              `Chat refused what the agent had to say about ${outstanding.message.id}, so it was dropped: ${error.message}`,
            ),
          );
          return;
        }
        onError(asError(error));
        await pause(pauses.next(), closing.signal);
      }
    }
  }

  /** Pick up what an earlier run left in the outbox. It needs no chat. */
  async function resume(): Promise<void> {
    const pauses = newBackoff();
    while (!closed()) {
      try {
        for (const outstanding of await turns.outstanding()) await take(outstanding);
        return;
      } catch (error) {
        if (closed()) return;
        onError(asError(error));
        await pause(pauses.next(), closing.signal);
      }
    }
  }

  const resuming = resume();
  const reading = readFeed({
    self,
    link,
    turns,
    admit,
    onError,
    stop: AbortSignal.any([taking.signal, closing.signal]),
    backoff: newBackoff(),
  });

  return {
    stopTaking: () => taking.abort(),
    async drain(signal) {
      // A turn that ended a moment ago is only just noticed.
      await new Promise<void>((resolve) => setImmediate(resolve));
      while (!signal.aborted && link.current() !== undefined) {
        const delivering = [...followed.values()].filter((entry) => entry.ended).map((entry) => entry.done);
        if (delivering.length === 0) return;
        await Promise.race([Promise.all(delivering), untilAborted(signal)]);
      }
    },
    async close() {
      closing.abort();
      await Promise.all([resuming, reading, ...[...followed.values()].map((entry) => entry.done)]);
    },
  };
}

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));
