import type { EntryRecord, RunFailure, SettledSubmissionRecord } from "@earendil-works/pi-durable";
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
export function toOutcome(record: SettledSubmissionRecord, answer: EntryRecord | undefined, ahead?: RunFailure): TurnOutcome {
  if (record.status === "done") {
    return { kind: "answered", answer: String(record.answer), text: answerText(answer) };
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
