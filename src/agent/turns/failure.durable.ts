import type { TurnFailure } from "../../contracts/agent/index.ts";

/**
 * Why a turn ended without an answer, or why an input was left without one, in
 * the contract's words, from what the engine gives: the reason and detail of a
 * run that failed, or of an input it left unanswered. A reason the agent has no
 * word for is `other`, with the engine's reason and detail as the detail, so a
 * client never sees the engine's reason as a value and nothing it said is lost.
 */
export function failureOf(ended: { readonly reason: string; readonly detail?: unknown }): TurnFailure {
  const detail = describe(ended.detail);
  switch (ended.reason) {
    case "model_error":
      return { reason: "model_failed", detail };
    case "no_model":
      return { reason: "no_model", detail };
    case "aborted":
      return { reason: "stopped", detail };
    // Cut off each time the model was answering, more often than its retries allow, or cut off too often anywhere in the turn.
    case "interrupted":
    case "restart_limit":
      return { reason: "kept_crashing", detail };
    case "faulted":
      return { reason: "internal_error", detail };
    // No definition can take the work up again: a run says so with why as its detail, and its inputs say why alone.
    case "orphaned":
      return { reason: "updated", detail };
    case "missing_task":
    case "task_too_old":
    case "migration_failed":
      return { reason: "updated", detail: detail ?? ended.reason };
    case "run_failed":
      return { reason: "turn_ahead_failed", detail };
    default:
      return { reason: "other", detail: detail === null ? ended.reason : `${ended.reason}: ${detail}` };
  }
}

/** What the engine says about why an input went unanswered, as text. */
function describe(detail: unknown): string | null {
  if (detail === undefined || detail === null) return null;
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}
