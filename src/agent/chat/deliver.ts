import type { LeftReceipt, Message } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { isChat, isOccurrence, type Occurrence, type Outstanding, readFinalText, type TurnOutcome } from "../inputs/index.ts";
import type { ChatCalls } from "../links/index.ts";
import { inParts, lineOf, lineRequestId, PICKED_UP_AGAIN, receiptDetail, replyRefused, replyRequestId } from "./reply.ts";

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
  /** Told when chat refuses an occurrence's line for good: its reply is posted without it, and nothing has its receipt. */
  onLineRefused(occurrence: Occurrence, error: Error): void;
}

/** Show an occurrence's line in the thread its turn answers in. Posting it again, as the reply does, shows it once. */
export function postLine(chat: ChatCalls, occurrence: Occurrence, threadId: string, recordsId: string, signal: AbortSignal): Promise<Message> {
  return chat.wakeLine(threadId, lineOf(occurrence), lineRequestId(recordsId, occurrence.id), signal);
}

/** Whether a turn ended with a reply to post: it answered, and not with `END` or nothing. */
export function hasReply(outcome: TurnOutcome): boolean {
  return outcome.kind === "answered" && readFinalText(outcome.text).kind === "reply";
}

/**
 * Tell chat how an input's turn ended: post the reply to the thread if there is
 * one, then leave the receipt on a chat event and on the earlier events that
 * were shown with it, or on an occurrence's line, which goes above the reply if
 * handing the occurrence over could not post it. Nothing else has a receipt.
 * Every step names itself, so doing all of it again after a failure or a crash
 * posts nothing twice and changes no receipt. A reply that chat refuses for good
 * is not posted, and the receipt says it failed; parts of it that were posted
 * stay.
 */
export async function deliver(
  chat: ChatCalls,
  outstanding: Outstanding,
  threadId: string,
  outcome: TurnOutcome,
  posting: Posting,
  signal: AbortSignal,
): Promise<void> {
  let line: Message | undefined;
  if (isOccurrence(outstanding)) {
    try {
      line = await postLine(chat, outstanding.occurrence, threadId, posting.recordsId, signal);
    } catch (error) {
      if (!isRefusal(error)) throw error;
      posting.onLineRefused(outstanding.occurrence, error);
    }
  }
  let receipt: LeftReceipt;
  try {
    receipt = await postReply(chat, threadId, outcome, posting, signal);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    posting.onRefused(outstanding, error);
    receipt = replyRefused(error.message);
  }
  if (line !== undefined) return chat.leaveReceipt([line.event], receipt, signal);
  if (!isChat(outstanding)) return;
  const ids = [...outstanding.earlier, outstanding.event].map((event) => event.id);
  for (let from = 0; from < ids.length; from += RECEIPTS_AT_ONCE) {
    await chat.leaveReceipt(ids.slice(from, from + RECEIPTS_AT_ONCE), receipt, signal);
  }
}

/** Post what the turn answered, in as many parts as it takes, and say what receipt it earns. */
async function postReply(
  chat: ChatCalls,
  threadId: string,
  outcome: TurnOutcome,
  { messageLimit, recordsId }: Posting,
  signal: AbortSignal,
): Promise<LeftReceipt> {
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
        : { status: "answered", reply: first.id, detail: outcome.cut === true ? PICKED_UP_AGAIN : null };
    }
    case "stopped":
      return { status: "stopped", reply: null, detail: null };
    case "skipped":
      return { status: "skipped", reply: null, detail: outcome.reason === undefined ? null : receiptDetail(outcome.reason) };
    case "failed":
      return { status: "failed", reply: null, detail: receiptDetail(outcome.reason) };
  }
}
