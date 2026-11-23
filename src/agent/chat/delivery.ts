import { MAX_MESSAGE_LENGTH } from "../../contracts/chat/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { hasReceipt, idOf, isOccurrence, isQuestion, isWakeup, type Outstanding, threadOf, type TurnOutcome } from "../inputs/index.ts";
import type { ChatLink, LiveChat } from "../links/index.ts";
import type { Look, Looked } from "../questions/index.ts";
import type { Delivery, Told } from "../turns/index.ts";
import { deliver, hasReply } from "./deliver.ts";
import { lookAt } from "./questions.ts";

export interface DeliveryOptions {
  /** What the agent's records are called. Every reply's request ID carries it. */
  recordsId: string;
  /** Told of failures, and of replies chat refused. */
  onError?: (error: Error) => void;
  /** Characters in the longest message the agent posts; a longer answer is posted in parts. Tests shorten it. */
  messageLimit?: number;
}

/**
 * What goes back to chat for an input, once the task that follows it knows how its
 * turn ended, and what a question's task looks up in chat when its time is up.
 * Each is one try over chat as it is up now, which comes to "later" when chat is
 * away, is lost meanwhile or the try fails, and once the agent has left chat: the
 * task sleeps, and tries again.
 */
export interface ChatDelivery extends Delivery, Look {
  /** Give it the agent's way to chat. Until then, every try comes to "later". */
  attach(link: ChatLink): void;
  /**
   * Post the reply if there is one and, for a chat event, leave the receipt. A
   * reply that chat refuses for good is not posted: the receipt says it failed,
   * with chat's reason. A receipt that chat refuses for good is dropped. A
   * wake-up, an occurrence of a trigger or the result of a question has no receipt
   * to carry a failure, or a reply that chat refuses, so those are reported; and
   * one in a session behind no thread has no reply to post, so it is told without
   * chat. Every step names itself, so doing all of it again posts nothing twice
   * and changes no receipt.
   */
  tell(outstanding: Outstanding, outcome: TurnOutcome, signal: AbortSignal): Promise<Told>;
  /** The agent leaves chat. What is due stays where it is, and is told at the next start. */
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
  let linked: ChatLink | undefined;
  let left = false;

  /**
   * Run `work` once over chat as it is up now. "later" when chat is not up, is
   * lost while `work` runs or `work` fails, and once the agent has left chat;
   * nothing when chat refuses for good, which `refused` reports. It ends with a
   * rejection only when `signal` aborts.
   */
  async function once<T>(
    signal: AbortSignal,
    work: (live: LiveChat, aborted: AbortSignal) => Promise<T>,
    refused: (error: Error) => void,
  ): Promise<T | undefined | "later"> {
    const live = left ? undefined : linked?.current();
    if (live === undefined) return "later";
    try {
      return await work(live, AbortSignal.any([signal, live.lost]));
    } catch (error) {
      if (signal.aborted) throw error;
      if (live.lost.aborted) return "later";
      if (isRefusal(error)) {
        refused(asError(error));
        return undefined;
      }
      onError(asError(error));
      return "later";
    }
  }

  return {
    attach(link) {
      linked = link;
    },
    async tell(outstanding, outcome, signal) {
      // A wake-up or an occurrence with no reply to post, or with no thread to post it to, has nobody to tell.
      const thread = threadOf(outstanding);
      if (thread === undefined || (!hasReceipt(outstanding) && !hasReply(outcome))) {
        if (outcome.kind === "failed") onError(new Error(`${failureOf(outstanding)} ${outcome.reason}`));
        return "told";
      }
      const tried = await once(
        signal,
        (live, aborted) => deliver(live.chat, outstanding, thread.threadId, outcome, posting, aborted),
        (error) => onError(new Error(`Chat refused the receipt on ${idOf(outstanding)}, so it was dropped: ${error.message}`)),
      );
      return tried === "later" ? "later" : "told";
    },
    look: (question, signal): Promise<Looked | undefined | "later"> =>
      once(
        signal,
        (live, aborted) => lookAt(live.chat, question, aborted, onError),
        (error) =>
          onError(
            new Error(
              `Chat refused to show the question asked of ${question.of.name} at ${localTime(question.askedAt)}, ` +
                `so it is closed as not answered: ${error.message}`,
            ),
          ),
      ),
    close() {
      left = true;
    },
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
