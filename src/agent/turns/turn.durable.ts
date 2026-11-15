import type { EntryRecord, RunFailure, SettledSubmissionRecord } from "@earendil-works/pi-durable";
import { failureWords } from "../../contracts/agent/index.ts";
import type { TurnOutcome } from "../inputs/index.ts";
import { answerText, describe } from "./answer.durable.ts";

/**
 * What a failed receipt says when the agent stopped unexpectedly too many times
 * while a turn was underway, and the engine ended it: the task that followed the
 * turn, or the turn's own work. It is what the engine's own reason for that says.
 */
export const CUT_OFF = failureWords("restart_limit", null);

/**
 * How a settled input ended, in the terms a message's receipt uses. `answer` is
 * the entry a `done` input points to. An input that was aborted after it was
 * placed in the transcript was being worked on: it was stopped. One aborted
 * while it still waited in the inbox never was: it was skipped, with no reason.
 * So was one the engine took back because the turn ahead of it failed, and its
 * reason says so, with why that turn failed when the session still says:
 * `ahead`.
 */
export function toOutcome(record: SettledSubmissionRecord, answer: EntryRecord | undefined, ahead?: RunFailure): TurnOutcome {
  if (record.status === "done") {
    return { kind: "answered", answer: String(record.answer), text: answerText(answer) };
  }
  if (record.reason === "aborted") return record.entry === undefined ? { kind: "skipped" } : { kind: "stopped" };
  if (record.reason === "run_failed") {
    return ahead === undefined
      ? { kind: "skipped", reason: failureWords("run_failed", null) }
      : { kind: "skipped", reason: `The turn ahead of it failed. ${failureWords(ahead.reason, describe(ahead.detail))}` };
  }
  return { kind: "failed", reason: failureWords(record.reason, describe(record.detail)) };
}
