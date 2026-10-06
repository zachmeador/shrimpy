import { MAX_MESSAGE_LENGTH } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { hasReceipt, idOf, isOccurrence, isQuestion, isWakeup, type Outstanding, threadOf, type TurnOutcome } from "../inputs/index.ts";
import type { ChatLink } from "../links/index.ts";
import type { Delivery } from "../turns/index.ts";
import { deliver, hasReply } from "./deliver.ts";
import { orAborted, pause, untilAborted } from "./pause.ts";

export interface DeliveryOptions {
  /** What the agent's records are called. Every reply's request ID carries it. */
  recordsId: string;
  /** Told of failures, and of replies chat refused. */
  onError?: (error: Error) => void;
  /** Characters in the longest message the agent posts; a longer answer is posted in parts. Tests shorten it. */
  messageLimit?: number;
  /** The pauses after a failure: one is made for each reply that retries. Tests shorten them. */
  backoff?: () => Backoff;
}

/** What goes back to chat for an input, once the task that follows it knows how its turn ended. */
export interface ChatDelivery extends Delivery {
  /** Give it the agent's way to chat. Until then, what is due waits. */
  attach(link: ChatLink): void;
  /**
   * Post the reply if there is one and, for a chat event, leave the receipt. It
   * waits for chat, and tries again after a failure, but a reply that chat
   * refuses for good is not posted: the receipt says it failed, with chat's
   * reason. A receipt that chat refuses for good is dropped. A wake-up, an
   * occurrence of a trigger or the result of a question has no receipt to carry
   * a failure, or a reply that chat refuses, so those are reported; and one in a
   * session behind no thread has no reply to post, so it never waits for chat.
   * Every step names itself, so doing all of it again after a crash posts
   * nothing twice and changes no receipt. It ends with a rejection only when
   * `signal` aborts.
   */
  tell(outstanding: Outstanding, outcome: TurnOutcome, signal: AbortSignal): Promise<void>;
  /** The agent leaves chat. What is due stays where it is until the engine closes, and is told at the next start. */
  close(): void;
}

export function createDelivery(options: DeliveryOptions): ChatDelivery {
  const onError = (error: Error): void => options.onError?.(error);
  const posting = {
    messageLimit: options.messageLimit ?? MAX_MESSAGE_LENGTH,
    recordsId: options.recordsId,
    onRefused: (outstanding: Outstanding, error: Error): void =>
      onError(
        new Error(
          hasReceipt(outstanding)
            ? `Chat refused the reply to ${idOf(outstanding)}, so its receipt says it failed: ${error.message}`
            : `Chat refused the reply to the ${what(outstanding)}, so it was not posted: ${error.message}`,
        ),
      ),
  };
  const newBackoff = options.backoff ?? backoff;
  const closing = new AbortController();
  let attached: (link: ChatLink) => void = () => undefined;
  const linked = new Promise<ChatLink>((resolve) => {
    attached = resolve;
  });

  return {
    attach: (link) => attached(link),
    async tell(outstanding, outcome, signal) {
      // A wake-up or an occurrence with no reply to post, or with no thread to post it to, has nobody to tell, and
      // chat being away is no reason to hold its task.
      const thread = threadOf(outstanding);
      if (thread === undefined || (!hasReceipt(outstanding) && !hasReply(outcome))) {
        if (outcome.kind === "failed") onError(new Error(`${failureOf(outstanding)} ${outcome.reason}`));
        return;
      }
      const stop = AbortSignal.any([signal, closing.signal]);
      const pauses = newBackoff();
      for (;;) {
        try {
          const link = await orAborted(linked, stop);
          await link.use((live, aborted) => deliver(live.chat, outstanding, thread.threadId, outcome, posting, aborted), stop);
          return;
        } catch (error) {
          // The engine is closing: the task stays where it is for the next start.
          if (signal.aborted) throw error;
          // The agent left chat first. A rejection now would end the task for good, so wait for the engine to close.
          if (closing.signal.aborted) {
            await untilAborted(signal);
            throw error;
          }
          if (isRefusal(error)) {
            onError(new Error(`Chat refused the receipt on ${idOf(outstanding)}, so it was dropped: ${error.message}`));
            return;
          }
          onError(asError(error));
          await pause(pauses.next(), stop);
        }
      }
    },
    close: () => closing.abort(),
  };
}

/** What a report calls a wake-up, an occurrence or the result of a question: "wake-up for 2026-10-04T09:00:00Z". */
function what(outstanding: Outstanding): string {
  if (isWakeup(outstanding)) return `wake-up for ${localTime(outstanding.wakeup.due)}`;
  if (isOccurrence(outstanding)) {
    return `occurrence of the trigger ${outstanding.occurrence.trigger} at ${localTime(outstanding.occurrence.firedAt)}`;
  }
  if (isQuestion(outstanding)) {
    return `result of the question asked of ${outstanding.question.of.name} at ${localTime(outstanding.question.askedAt)}`;
  }
  return idOf(outstanding);
}

/** The start of what a report says about an input that failed and has no receipt to carry it. */
function failureOf(outstanding: Outstanding): string {
  const ran = isOccurrence(outstanding) && outstanding.unrun !== undefined ? "did not run." : "did not get an answer.";
  return `The ${what(outstanding)} ${ran}`;
}

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));
