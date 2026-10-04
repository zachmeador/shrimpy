import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { Conversation, EntryRecord, SettledSubmissionRecord, Submission } from "@earendil-works/pi-durable";
import type { Turn, TurnOutcome } from "../intake/index.ts";
import { answerEntry, answerText, describe } from "./settlement.ts";

/** The turn a message became: the submission its text was handed over as. */
export function turnOf(conversation: Conversation, submission: Submission): Turn {
  let settled: SettledSubmissionRecord | undefined;
  return {
    async ended(signal) {
      settled = await submission.wait(withAbortSignal(signal, BACKGROUND_CONTEXT));
    },
    async outcome() {
      if (settled === undefined) throw new Error("The turn has not ended.");
      const answer = await answerEntry(conversation, settled.status === "done" ? settled.answer : undefined, BACKGROUND_CONTEXT);
      return toOutcome(settled, answer);
    },
  };
}

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
