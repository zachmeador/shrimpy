import { asSentence, singleSpaced, withoutPeriod } from "../../lib/text/index.ts";
import type { FailureReason } from "./shapes.ts";

/**
 * The most of a detail a sentence carries, so that what to do still fits in a
 * receipt, whose detail chat holds to 500 characters.
 */
const DETAIL_CHARACTERS = 300;

/** A detail as the end of a sentence, on one line and cut to fit. */
function detailSentence(detail: string): string {
  const line = singleSpaced(detail);
  return asSentence(line.length > DETAIL_CHARACTERS ? `${line.slice(0, DETAIL_CHARACTERS - 1)}…` : line);
}

/** The part of a sentence that says what more there is to know, when there is: ": detail.", or ".". */
const andDetail = (detail: string | null): string => (detail === null || detail.trim() === "" ? "." : `: ${detailSentence(detail)}`);

/**
 * Why a turn ended without an answer, as one sentence or two for a person, with
 * what to do. `reason` is why, as a session's status and an unanswered
 * settlement carry it, and `detail` is what more the agent knows, or null.
 * Every client and the agent's receipts say a reason this way, so it reads the
 * same wherever it is shown.
 */
export function failureWords(reason: FailureReason, detail: string | null): string {
  switch (reason) {
    case "model_failed":
      return `The model failed${andDetail(detail)} Send it again, or try another model with /model.`;
    case "no_model":
      return detail === null
        ? "The agent has no model it can use. Sign in with shrimpy login where it runs, or give it a model it can reach."
        : `The agent can't use its model, ${detailSentence(detail)} Sign in with shrimpy login where it runs, or give it a model it can reach.`;
    case "stopped":
      return "The work was stopped before it answered. Send it again to start over.";
    case "kept_crashing":
      return "The agent stopped unexpectedly too many times while working on this, so it gave up. Check that it stays running, then send it again.";
    case "internal_error":
      return `The agent hit an internal error${andDetail(detail)} Send it again to try once more.`;
    case "updated":
      return `The agent could not go on with this after it was updated${andDetail(detail)} Send it again to start over.`;
    case "turn_ahead_failed":
      return "It was taken back before the agent reached it, because the turn ahead of it failed. Send it again.";
    case "other":
      return detail === null || detail.trim() === ""
        ? "The turn ended without an answer."
        : `The turn ended without an answer (${withoutPeriod(detailSentence(detail))}).`;
  }
}
