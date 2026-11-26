import { MAX_MESSAGE_LENGTH } from "../../contracts/chat/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { localTime } from "../../lib/time/index.ts";
import {
  hasReceipt,
  idOf,
  isOccurrence,
  isProcess,
  isWatch,
  type Outstanding,
  threadOf,
  type TurnOutcome,
} from "../inputs/index.ts";
import type { ChatLink, LiveChat } from "../links/index.ts";
import type { Delivery, Told } from "../turns/index.ts";
import { deliver, hasReply, postWakeLine } from "./deliver.ts";
import { wakeLineOf } from "./reply.ts";

export interface DeliveryOptions {
  recordsId: string;
  onError?: (error: Error) => void;
  messageLimit?: number;
}

export interface ChatDelivery extends Delivery {
  attach(link: ChatLink): void;
  tell(outstanding: Outstanding, outcome: TurnOutcome, signal: AbortSignal): Promise<Told>;
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
    onLineRefused: (outstanding: Outstanding, error: Error): void => onError(lineRefused(outstanding, error)),
  };
  let linked: ChatLink | undefined;
  let left = false;

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
    async announce(outstanding, signal) {
      const thread = threadOf(outstanding);
      if (thread === undefined || wakeLineOf(outstanding) === undefined) return "told";
      const tried = await once(
        signal,
        (live, aborted) => postWakeLine(live.chat, outstanding, thread.threadId, options.recordsId, aborted)!,
        (error) => onError(lineRefused(outstanding, error)),
      );
      return tried === "later" ? "later" : "told";
    },
    async tell(outstanding, outcome, signal) {
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
    close() {
      left = true;
    },
  };
}

function what(outstanding: Outstanding): string {
  if (isOccurrence(outstanding)) {
    const label = outstanding.occurrence.trigger === null ? "one-time trigger" : `trigger ${outstanding.occurrence.trigger}`;
    return `occurrence of the ${label} at ${localTime(outstanding.occurrence.firedAt)}`;
  }
  if (isProcess(outstanding)) {
    return `background command ${outstanding.process.id} (${outstanding.process.state}) at ${localTime(outstanding.process.at)}`;
  }
  if (isWatch(outstanding)) {
    return `reply from @${outstanding.settled.watch.onAgent.name} at ${localTime(outstanding.settled.at)}`;
  }
  return idOf(outstanding);
}

const lineRefused = (outstanding: Outstanding, error: Error): Error =>
  new Error(`Chat refused the wake line for the ${what(outstanding)}, so the thread doesn't show it: ${error.message}`);

function failureOf(outstanding: Outstanding): string {
  const ran = isOccurrence(outstanding) && outstanding.unrun !== undefined ? "did not run." : "did not get an answer.";
  return `The ${what(outstanding)} ${ran}`;
}
