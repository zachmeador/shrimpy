import type { EntryRecord, SettledSubmissionRecord } from "@earendil-works/pi-durable";
import type { TurnOutcome } from "../intake/index.ts";
import { answerText, describe } from "./settlement.ts";

/**
 * How a settled input ended, in the terms a message's receipt uses. `answer` is
 * the entry a `done` input points to. An input that was aborted after it was
 * placed in the transcript was being worked on: it was stopped. One aborted
 * while it still waited in the inbox never was: it was skipped.
 */
export function toOutcome(record: SettledSubmissionRecord, answer: EntryRecord | undefined): TurnOutcome {
  if (record.status === "done") {
    return { kind: "answered", answer: String(record.answer), text: answerText(answer) };
  }
  if (record.reason === "aborted") return record.entry === undefined ? { kind: "skipped" } : { kind: "stopped" };
  return { kind: "failed", reason: failure(record.reason, describe(record.detail)) };
}

/** Why an input went unanswered, short enough for a person to read in a receipt. */
function failure(reason: string, detail: string | null): string {
  switch (reason) {
    case "model_error":
      return detail === null ? "The model failed." : `The model failed: ${detail}`;
    case "no_model":
      return "The agent has no model it can use.";
    case "faulted":
      return detail === null ? "The agent hit an internal error." : `The agent hit an internal error: ${detail}`;
    default:
      return `The turn ended without an answer (${reason}).`;
  }
}
