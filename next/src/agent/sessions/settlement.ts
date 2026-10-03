import type { Context } from "@earendil-works/chord";
import type {
  Conversation,
  EntryRecord,
  Harness,
  SettledSubmissionRecord,
  SubmissionId,
} from "@earendil-works/pi-durable";
import { ServerError } from "@earendil-works/pi-server";
import type { Settlement } from "../../contracts/agent/index.ts";
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
    throw new ServerError("service_invalid_value", `Unknown submission: ${submissionId}`);
  }
  const settled = await submission.wait(context);
  if (settled.status !== "done") return toSettlement(settled, undefined);
  const answer = await conversation.entries(
    { minEntryId: settled.answer, maxEntryId: settled.answer },
    1,
    undefined,
    context,
  );
  return toSettlement(settled, answer.items[0]);
}

/** `answer` is the entry a `done` submission points to. */
export function toSettlement(record: SettledSubmissionRecord, answer: EntryRecord | undefined): Settlement {
  if (record.status === "done") {
    const message = answer?.model?.[0];
    return { status: "answered", text: message?.role === "assistant" ? assistantText(message) : "" };
  }
  if (record.reason === "aborted") return { status: "cancelled" };
  return { status: "unanswered", reason: record.reason, detail: describe(record.detail) };
}

function describe(detail: unknown): string | null {
  if (detail === undefined || detail === null) return null;
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}
