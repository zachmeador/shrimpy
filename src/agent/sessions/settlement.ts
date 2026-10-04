import type { Context } from "@earendil-works/chord";
import type {
  Conversation,
  EntryId,
  EntryRecord,
  Harness,
  SettledSubmissionRecord,
  SubmissionId,
} from "@earendil-works/pi-durable";
import type { Settlement } from "../../contracts/agent/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { assistantText } from "./session-view.ts";

/** Wait for a submission of `conversation` to end, and say how it ended. */
export async function waitForSettlement(
  harness: Harness,
  conversation: Conversation,
  submissionId: number,
  context: Context,
): Promise<Settlement> {
  const submission = await harness.submission(submissionId as SubmissionId, context);
  // Submissions are numbered across the whole home, so check this one belongs to the session.
  if (submission === undefined || (await submission.status(context)).conversationId !== conversation.id) {
    refuse(`Unknown submission: ${submissionId}`);
  }
  const settled = await submission.wait(context);
  if (settled.status !== "done") return toSettlement(settled, undefined);
  return toSettlement(settled, await answerEntry(conversation, settled.answer, context));
}

/** The entry a `done` submission points to as its answer. */
export async function answerEntry(
  conversation: Conversation,
  answer: EntryId | undefined,
  context: Context,
): Promise<EntryRecord | undefined> {
  if (answer === undefined) return undefined;
  const found = await conversation.entries({ minEntryId: answer, maxEntryId: answer }, 1, undefined, context);
  return found.items[0];
}

/** `answer` is the entry a `done` submission points to. */
export function toSettlement(record: SettledSubmissionRecord, answer: EntryRecord | undefined): Settlement {
  if (record.status === "done") return { status: "answered", text: answerText(answer) };
  if (record.reason === "aborted") return { status: "cancelled" };
  return { status: "unanswered", reason: record.reason, detail: describe(record.detail) };
}

/** The words of an answer entry, or nothing if the entry holds no answer. */
export function answerText(answer: EntryRecord | undefined): string {
  const message = answer?.model?.[0];
  return message?.role === "assistant" ? assistantText(message) : "";
}

/** What the engine says about why an input went unanswered, as text. */
export function describe(detail: unknown): string | null {
  if (detail === undefined || detail === null) return null;
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}
