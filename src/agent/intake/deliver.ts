import {
  type ChatClient,
  MAX_RECEIPT_DETAIL_LENGTH,
  type Message,
  type Receipt,
} from "../../contracts/chat/index.ts";
import { clip, inParts, readFinalText, replyRequestId } from "./reply.ts";
import type { Outstanding, TurnOutcome } from "./turns.ts";

/** Messages one receipt call takes, as the chat contract describes. */
const RECEIPTS_AT_ONCE = 200;

/**
 * Tell chat how a message's turn ended: post the reply if there is one, then
 * leave the receipt on the message and on the earlier messages that were shown
 * with it. Every step names itself, so doing all of it again after a failure
 * or a crash posts nothing twice and changes no receipt.
 */
export async function deliver(
  chat: ChatClient,
  outstanding: Outstanding,
  outcome: TurnOutcome,
  messageLimit: number,
  signal: AbortSignal,
): Promise<void> {
  const receipt = await postReply(chat, outstanding, outcome, messageLimit, signal);
  const ids = [...outstanding.earlier, outstanding.message].map((message) => message.id);
  for (let from = 0; from < ids.length; from += RECEIPTS_AT_ONCE) {
    await chat.leaveReceipt(ids.slice(from, from + RECEIPTS_AT_ONCE), receipt, signal);
  }
}

/** Post what the turn answered, in as many parts as it takes, and say what receipt it earns. */
async function postReply(
  chat: ChatClient,
  outstanding: Outstanding,
  outcome: TurnOutcome,
  messageLimit: number,
  signal: AbortSignal,
): Promise<Omit<Receipt, "memberId">> {
  switch (outcome.kind) {
    case "answered": {
      const reading = readFinalText(outcome.text);
      const parts = reading.kind === "silent" ? [] : inParts(reading.text, messageLimit);
      let first: Message | undefined;
      for (const [index, part] of parts.entries()) {
        const requestId = replyRequestId(outstanding.threadId, outcome.answer, index);
        const posted = await chat.post(outstanding.threadId, part, requestId, signal);
        first ??= posted;
      }
      return first === undefined
        ? { status: "silent", reply: null, detail: null }
        : { status: "answered", reply: first.id, detail: null };
    }
    case "stopped":
    case "skipped":
      return { status: outcome.kind, reply: null, detail: null };
    case "failed":
      return { status: "failed", reply: null, detail: clip(outcome.reason, MAX_RECEIPT_DETAIL_LENGTH) };
  }
}
