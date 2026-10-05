import {
  type ChatClient,
  MAX_RECEIPT_DETAIL_LENGTH,
  type Message,
  type Receipt,
} from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { isChat, type Outstanding, readFinalText, type TurnOutcome } from "../inputs/index.ts";
import { clip, inParts, replyRequestId } from "./reply.ts";

/** Events one receipt call takes, as the chat contract describes. */
const RECEIPTS_AT_ONCE = 200;

/** What the agent's replies are posted with. */
interface Posting {
  /** Characters in the longest message the agent posts; a longer answer is posted in parts. */
  messageLimit: number;
  /** What the agent's records are called, which every reply's request ID carries. */
  recordsId: string;
  /** Told when chat refuses a reply for good, which a chat event's receipt then says. */
  onRefused(outstanding: Outstanding, error: Error): void;
}

/** What an agent's receipt says: `Receipt` without the member who left it and the event it is left on. */
type Left = Omit<Receipt, "memberId" | "event">;

/** Whether a turn ended with a reply to post: it answered, and not with `END` or nothing. */
export function hasReply(outcome: TurnOutcome): boolean {
  return outcome.kind === "answered" && readFinalText(outcome.text).kind === "reply";
}

/**
 * Tell chat how an input's turn ended: post the reply to the thread if there is
 * one, then leave the receipt on a chat event and on the earlier events that
 * were shown with it. Nothing else has a receipt. Every step names itself, so
 * doing all of it again after a failure or a crash posts nothing twice and
 * changes no receipt. A reply that chat refuses for good is not posted, and the
 * receipt says it failed; parts of it that were posted stay.
 */
export async function deliver(
  chat: ChatClient,
  outstanding: Outstanding,
  threadId: string,
  outcome: TurnOutcome,
  posting: Posting,
  signal: AbortSignal,
): Promise<void> {
  let receipt: Left;
  try {
    receipt = await postReply(chat, threadId, outcome, posting, signal);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    posting.onRefused(outstanding, error);
    receipt = {
      status: "failed",
      reply: null,
      detail: clip(`The reply could not be posted: ${error.message}`, MAX_RECEIPT_DETAIL_LENGTH),
    };
  }
  if (!isChat(outstanding)) return;
  const ids = [...outstanding.earlier, outstanding.event].map((event) => event.id);
  for (let from = 0; from < ids.length; from += RECEIPTS_AT_ONCE) {
    await chat.leaveReceipt(ids.slice(from, from + RECEIPTS_AT_ONCE), receipt, signal);
  }
}

/** Post what the turn answered, in as many parts as it takes, and say what receipt it earns. */
async function postReply(
  chat: ChatClient,
  threadId: string,
  outcome: TurnOutcome,
  { messageLimit, recordsId }: Posting,
  signal: AbortSignal,
): Promise<Left> {
  switch (outcome.kind) {
    case "answered": {
      const reading = readFinalText(outcome.text);
      const parts = reading.kind === "silent" ? [] : inParts(reading.text, messageLimit);
      let first: Message | undefined;
      for (const [index, part] of parts.entries()) {
        const requestId = replyRequestId(recordsId, threadId, outcome.answer, index);
        const posted = await chat.post(threadId, part, requestId, signal);
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
