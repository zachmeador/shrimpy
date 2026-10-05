import { MAX_MESSAGE_LENGTH } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import type { ChatLink } from "../links/index.ts";
import { deliver, hasReply } from "./deliver.ts";
import { idOf, isWakeup, type Outstanding, type TurnOutcome } from "./events.ts";
import { orAborted, pause, untilAborted } from "./pause.ts";
import { utc } from "./prompt.ts";

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

/** What goes back for an input, once the task that follows it knows how its turn ended. */
export interface Delivery {
  /** Give it the agent's way to chat. Until then, what is due waits. */
  attach(link: ChatLink): void;
  /**
   * Post the reply if there is one and, for a chat event, leave the receipt. It
   * waits for chat, and tries again after a failure, but a reply that chat
   * refuses for good is not posted: the receipt says it failed, with chat's
   * reason. A receipt that chat refuses for good is dropped. A wake-up has no
   * receipt to carry a failure, or a reply that chat refuses, so those are
   * reported. Every step names itself, so doing all of it again after a crash
   * posts nothing twice and changes no receipt. It ends with a rejection only
   * when `signal` aborts.
   */
  tell(outstanding: Outstanding, outcome: TurnOutcome, signal: AbortSignal): Promise<void>;
  /** The agent leaves chat. What is due stays where it is until the engine closes, and is told at the next start. */
  close(): void;
}

export function createDelivery(options: DeliveryOptions): Delivery {
  const onError = (error: Error): void => options.onError?.(error);
  const posting = {
    messageLimit: options.messageLimit ?? MAX_MESSAGE_LENGTH,
    recordsId: options.recordsId,
    onRefused: (outstanding: Outstanding, error: Error): void =>
      onError(
        new Error(
          isWakeup(outstanding)
            ? `Chat refused the reply to the wake-up for ${utc(outstanding.wakeup.due)}, so it was not posted: ${error.message}`
            : `Chat refused the reply to ${idOf(outstanding)}, so its receipt says it failed: ${error.message}`,
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
      // A wake-up with no reply to post has nobody to tell, and chat being away is no reason to hold its task.
      if (isWakeup(outstanding) && !hasReply(outcome)) {
        if (outcome.kind === "failed") {
          onError(new Error(`The wake-up for ${utc(outstanding.wakeup.due)} did not get an answer. ${outcome.reason}`));
        }
        return;
      }
      const stop = AbortSignal.any([signal, closing.signal]);
      const pauses = newBackoff();
      for (;;) {
        try {
          const link = await orAborted(linked, stop);
          await link.use((live, aborted) => deliver(live.chat, outstanding, outcome, posting, aborted), stop);
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

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));
