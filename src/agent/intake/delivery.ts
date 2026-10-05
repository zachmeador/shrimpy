import { MAX_MESSAGE_LENGTH } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { type Backoff, backoff } from "../../lib/retry/index.ts";
import type { ChatLink } from "../links/index.ts";
import { deliver } from "./deliver.ts";
import type { Outstanding, TurnOutcome } from "./events.ts";
import { orAborted, pause, untilAborted } from "./pause.ts";

export interface DeliveryOptions {
  /** Told of failures, and of replies chat refused. */
  onError?: (error: Error) => void;
  /** Characters in the longest message the agent posts; a longer answer is posted in parts. Tests shorten it. */
  messageLimit?: number;
  /** The pauses after a failure: one is made for each reply that retries. Tests shorten them. */
  backoff?: () => Backoff;
}

/** What goes back to chat for an event, once the task that follows it knows how its turn ended. */
export interface Delivery {
  /** Give it the agent's way to chat. Until then, what is due waits. */
  attach(link: ChatLink): void;
  /**
   * Post the reply if there is one and leave the receipt. It waits for chat,
   * and tries again after a failure, but what chat refuses for good is dropped.
   * Every step names itself, so doing all of it again after a crash posts
   * nothing twice and changes no receipt. It ends with a rejection only when
   * `signal` aborts.
   */
  tell(outstanding: Outstanding, outcome: TurnOutcome, signal: AbortSignal): Promise<void>;
  /** The agent leaves chat. What is due stays where it is until the engine closes, and is told at the next start. */
  close(): void;
}

export function createDelivery(options: DeliveryOptions = {}): Delivery {
  const onError = (error: Error): void => options.onError?.(error);
  const messageLimit = options.messageLimit ?? MAX_MESSAGE_LENGTH;
  const newBackoff = options.backoff ?? backoff;
  const closing = new AbortController();
  let attached: (link: ChatLink) => void = () => undefined;
  const linked = new Promise<ChatLink>((resolve) => {
    attached = resolve;
  });

  return {
    attach: (link) => attached(link),
    async tell(outstanding, outcome, signal) {
      const stop = AbortSignal.any([signal, closing.signal]);
      const pauses = newBackoff();
      for (;;) {
        try {
          const link = await orAborted(linked, stop);
          await link.use((live, aborted) => deliver(live.chat, outstanding, outcome, messageLimit, aborted), stop);
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
            onError(
              new Error(
                `Chat refused what the agent had to say about ${outstanding.event.id}, so it was dropped: ${error.message}`,
              ),
            );
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
