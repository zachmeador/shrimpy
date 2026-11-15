/**
 * The most of a detail a sentence carries, so that what to do still fits in a
 * receipt, whose detail chat holds to 500 characters.
 */
const DETAIL_CHARACTERS = 300;

/** A detail as the end of a sentence, on one line and cut to fit: as it is when it ends like one, and with a period when it doesn't. */
function asSentence(detail: string): string {
  const line = detail.replace(/\s+/g, " ").trim();
  const trimmed = line.length > DETAIL_CHARACTERS ? `${line.slice(0, DETAIL_CHARACTERS - 1)}…` : line;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** The part of a sentence that says what more there is to know, when there is: ": detail.", or ".". */
const andDetail = (detail: string | null): string => (detail === null || detail.trim() === "" ? "." : `: ${asSentence(detail)}`);

/**
 * Why a turn ended without an answer, as one sentence or two for a person, with
 * what to do. `reason` is the short code a session's status and an unanswered
 * settlement carry, such as `model_error`, and `detail` is what more the agent
 * knows, or null. Every client and the agent's receipts say a reason this way,
 * so it reads the same wherever it is shown.
 */
export function failureWords(reason: string, detail: string | null): string {
  switch (reason) {
    case "model_error":
      return `The model failed${andDetail(detail)} Send it again, or try another model with /model.`;
    case "no_model":
      return detail === null
        ? "The agent has no model it can use. Sign in with shrimpy login where it runs, or give it a model it can reach."
        : `The agent can't use its model, ${asSentence(detail)} Sign in with shrimpy login where it runs, or give it a model it can reach.`;
    case "aborted":
      return "The work was stopped before it answered. Send it again to start over.";
    case "interrupted":
      return "The agent stopped unexpectedly each time the model was answering, so it gave up. Check that it stays running, then send it again.";
    case "restart_limit":
      return "The agent stopped unexpectedly too many times while working on this, so it gave up. Check that it stays running, then send it again.";
    case "faulted":
      return `The agent hit an internal error${andDetail(detail)} Send it again to try once more.`;
    case "orphaned":
      return `The agent could not go on with this after it was updated${andDetail(detail)} Send it again to start over.`;
    case "run_failed":
      return "It was taken back before the agent reached it, because the turn ahead of it failed. Send it again.";
    default:
      return `The turn ended without an answer (${detail === null ? reason : `${reason}: ${asSentence(detail).replace(/\.$/, "")}`}).`;
  }
}
