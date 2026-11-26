import { createHash } from "node:crypto";
import { type LeftReceipt, MAX_RECEIPT_DETAIL_LENGTH, MAX_WAKE_LINE_LENGTH, type WakeLineInput } from "../../contracts/chat/index.ts";
import { cutEnd } from "../../lib/text/index.ts";
import { idOf, isOccurrence, isProcess, isWatch, type Outstanding } from "../inputs/index.ts";

/**
 * Split text into messages of at most `limit` characters. A part ends where a
 * line does when it can end in the later half of what fits, and never splits a
 * character that takes two code units. Parts with nothing in them are dropped,
 * because chat does not take them.
 */
export function inParts(text: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = cutPoint(rest, limit);
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts.filter((part) => part.trim() !== "");
}

function cutPoint(text: string, limit: number): number {
  const lineBreak = text.lastIndexOf("\n", limit - 1);
  if (lineBreak >= limit / 2) return lineBreak + 1;
  return Math.max(cutEnd(text, limit).length, 1);
}

/** `text` as the detail of a receipt: cut to what chat takes, with an ellipsis when it was cut. */
export const receiptDetail = (text: string): string => cutEnd(text, MAX_RECEIPT_DETAIL_LENGTH, { ending: "…" });

/** The wake line for an input that leaves one in its thread (trigger, process, or settled watch), or undefined for chat events. */
export function wakeLineOf(outstanding: Outstanding): WakeLineInput | undefined {
  const fit = (text: string): string => cutEnd(text, MAX_WAKE_LINE_LENGTH, { ending: "…" });
  if (isOccurrence(outstanding)) {
    const { occurrence } = outstanding;
    return {
      kind: "trigger",
      name: occurrence.trigger,
      firedAt: occurrence.firedAt,
      prompt: fit(occurrence.prompt),
      output: occurrence.output === undefined ? null : fit(occurrence.output),
    };
  }
  if (isProcess(outstanding)) {
    const { process: event } = outstanding;
    const trimmed = event.output.trimEnd();
    return {
      kind: "process",
      id: event.id,
      command: fit(event.command),
      state: event.state,
      code: event.code,
      afterMs: event.afterMs,
      at: event.at,
      output: trimmed === "" ? null : fit(trimmed),
    };
  }
  if (isWatch(outstanding)) {
    const { settled } = outstanding;
    return {
      kind: "answer",
      from: settled.watch.onAgent.id,
      thread: settled.watch.toThread,
      status: settled.result.kind,
      at: settled.at,
    };
  }
  return undefined;
}

/** Names a wake line idempotently by the agent's records ID and the input's ID. */
export const lineRequestId = (recordsId: string, outstanding: Outstanding): string => `line-${recordsId}-${idOf(outstanding)}`;

/** What the receipt of an answer says when the agent ended uncleanly while its turn ran. */
export const PICKED_UP_AGAIN = "The agent stopped unexpectedly while working on this and picked it up again.";

/** The receipt left when chat refused the reply, which says so with chat's words. */
export const replyRefused = (words: string): LeftReceipt => ({
  status: "failed",
  reply: null,
  detail: receiptDetail(`The reply could not be posted: ${words}`),
});

export function replyRequestId(recordsId: string, threadId: string, answer: string, part: number): string {
  return `reply-${recordsId}-${threadId}-${answer}-${part}`;
}

export function commandReplyRequestId(eventId: string, line: string): string {
  return `command-${eventId}-${createHash("sha256").update(line).digest("hex").slice(0, 16)}`;
}
