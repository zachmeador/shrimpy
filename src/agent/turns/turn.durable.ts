import type { Context } from "@earendil-works/chord/context";
import type { ToolResultMessage } from "@earendil-works/pi-ai";
import {
  AssistantEntry,
  CompactionEntry,
  type Cursor,
  type EntryId,
  type EntryQuery,
  type EntryRecord,
  type Page,
  ResetEntry,
  type RunFailure,
  type SettledSubmissionRecord,
  ToolResultEntry,
} from "@earendil-works/pi-durable";
import { failureWords } from "../../contracts/agent/index.ts";
import type { TurnOutcome } from "../inputs/index.ts";
import { answerText } from "./answer.durable.ts";
import { failureOf } from "./failure.durable.ts";

/**
 * What a failed receipt says when the agent stopped unexpectedly too many times
 * while a turn was underway, and the engine ended it: the task that followed the
 * turn, or the turn's own work. It says the same as a turn the engine itself
 * ends at its limit.
 */
export const CUT_OFF = failureWords("kept_crashing", null);

/**
 * How a settled input ended, in the terms a message's receipt uses. `answer` is
 * the entry a `done` input points to. An input whose work was stopped after it
 * was placed in the transcript was being worked on: it was stopped. One stopped
 * while it still waited in the inbox never was: it was skipped, with no reason.
 * So was one the engine took back because the turn ahead of it failed, and its
 * reason says so, with why that turn failed when the session still says:
 * `ahead`.
 */
export function toOutcome(record: SettledSubmissionRecord, answer: EntryRecord | undefined, ahead?: RunFailure, attachments: readonly string[] = []): TurnOutcome {
  if (record.status === "done") {
    return { kind: "answered", answer: String(record.answer), text: answerText(answer), ...(attachments.length === 0 ? {} : { attachments: [...attachments] }) };
  }
  const failure = failureOf(record);
  if (failure.reason === "stopped") return record.entry === undefined ? { kind: "skipped" } : { kind: "stopped" };
  if (failure.reason === "turn_ahead_failed") {
    if (ahead === undefined) return { kind: "skipped", reason: failureWords("turn_ahead_failed", null) };
    const why = failureOf(ahead);
    return { kind: "skipped", reason: `The turn ahead of it failed. ${failureWords(why.reason, why.detail)}` };
  }
  return { kind: "failed", reason: failureWords(failure.reason, failure.detail) };
}

/** What a tool leaves in its result's details to send files with the reply its turn ends with: chat's attachments, in order. */
export type ForReply = { forReply: string[] };

/** Entries of a session, as a task's runtime reads them. */
type ReadEntries = (query: Omit<EntryQuery, "conversationId">, limit: number, cursor: Cursor | undefined, context: Context) => Promise<Page<EntryRecord, Cursor>>;

/**
 * The files the tools of the turn that `answer` ends left for the reply: those
 * of every result between the answer and the one before it, in the order the
 * tools ran. A tool that failed left none. So the files are the answer's
 * alone, whichever of the inputs it answers asks.
 */
export async function forReply(answer: EntryId, entries: ReadEntries, context: Context): Promise<string[]> {
  const found: string[][] = [];
  let cursor: Cursor | undefined;
  for (;;) {
    const page = await entries({ maxEntryId: (answer - 1) as EntryId, order: "descending" }, 100, cursor, context);
    for (const entry of page.items) {
      const message = entry.model?.[0];
      const answered = AssistantEntry.is(entry) && message?.role === "assistant" && message.stopReason !== "toolUse";
      if (answered || ResetEntry.is(entry) || CompactionEntry.is(entry)) return found.flat();
      if (ToolResultEntry.is(entry) && message?.role === "toolResult") found.unshift(filesIn(message));
    }
    if (page.next === undefined) return found.flat();
    cursor = page.next;
  }
}

function filesIn(result: ToolResultMessage): string[] {
  const details = result.details as Partial<ForReply> | undefined;
  return result.isError || !Array.isArray(details?.forReply) ? [] : details.forReply.filter((file) => typeof file === "string");
}
