import type { LeftReceipt, Message } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import { isChat, type Outstanding, readFinalText, type TurnOutcome } from "../inputs/index.ts";
import type { ChatCalls } from "../links/index.ts";
import { inParts, lineRequestId, PICKED_UP_AGAIN, receiptDetail, replyRefused, replyRequestId, wakeLineOf } from "./reply.ts";

/** Events one receipt call takes, as the chat contract describes. */
const RECEIPTS_AT_ONCE = 200;

/** What the agent's replies are posted with. */
interface Posting {
  messageLimit: number;
  recordsId: string;
  onRefused(outstanding: Outstanding, error: Error): void;
  onLineRefused(outstanding: Outstanding, error: Error): void;
}

/** Post a wake line in the thread an input's turn answers in, if this input leaves one. */
export function postWakeLine(
  chat: ChatCalls,
  outstanding: Outstanding,
  threadId: string,
  recordsId: string,
  signal: AbortSignal,
): Promise<Message> | undefined {
  const wake = wakeLineOf(outstanding);
  if (wake === undefined) return undefined;
  return chat.wakeLine(threadId, wake, lineRequestId(recordsId, outstanding), signal);
}

/** Whether a turn ended with a reply to post: it answered, and not with `END` or nothing, or its tools left files for the reply. */
export function hasReply(outcome: TurnOutcome): boolean {
  return outcome.kind === "answered" && (readFinalText(outcome.text).kind === "reply" || (outcome.attachments ?? []).length > 0);
}

/**
 * Tell chat how an input's turn ended: post its wake line (for trigger,
 * process, or settled watch inputs), post its reply if there is one, and leave
 * its receipt on the wake line's event or the chat events.
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
  const lineCall = postWakeLine(chat, outstanding, threadId, posting.recordsId, signal);
  if (lineCall !== undefined) {
    try {
      line = await lineCall;
    } catch (error) {
      if (!isRefusal(error)) throw error;
      posting.onLineRefused(outstanding, error);
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
      const files = outcome.attachments ?? [];
      if (parts.length === 0 && files.length > 0) parts.push("");
      let first: Message | undefined;
      for (const [index, part] of parts.entries()) {
        const requestId = replyRequestId(recordsId, threadId, outcome.answer, index);
        const posted = await chat.post(threadId, part, requestId, signal, { attachments: index === parts.length - 1 ? files : [] });
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
