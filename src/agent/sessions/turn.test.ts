import assert from "node:assert/strict";
import { test } from "node:test";
import type { EntryRecord, SettledSubmissionRecord } from "@earendil-works/pi-durable";
import { toOutcome } from "./turn.ts";

const base = { id: 7, conversationId: 1, type: "input" } as const;

const done = { ...base, status: "done", entry: 3, answer: 5 } as unknown as SettledSubmissionRecord;

/** An input that was never placed in the transcript: it was queued when it was withdrawn or failed. */
function unplaced(reason: string, detail?: unknown): SettledSubmissionRecord {
  return { ...base, status: "unanswered", reason, detail } as unknown as SettledSubmissionRecord;
}

/** An input that was placed in the transcript, so its turn was under way. */
function placed(reason: string, detail?: unknown): SettledSubmissionRecord {
  return { ...base, status: "unanswered", entry: 3, reason, detail } as unknown as SettledSubmissionRecord;
}

function answer(content: unknown[]): EntryRecord {
  return { kind: "pi.assistant", model: [{ role: "assistant", content, stopReason: "stop" }] } as unknown as EntryRecord;
}

test("an answered input carries the entry of its answer and the words of it", () => {
  const entry = answer([
    { type: "thinking", thinking: "Let me see." },
    { type: "text", text: "The files are " },
    { type: "toolCall", id: "c", name: "bash", arguments: {} },
    { type: "text", text: "a.txt and b.txt." },
  ]);

  assert.deepEqual(toOutcome(done, entry), { kind: "answered", answer: "5", text: "The files are a.txt and b.txt." });
});

test("an answer with no words is still an answer, with empty text", () => {
  assert.deepEqual(toOutcome(done, answer([{ type: "thinking", thinking: "Nothing to say." }])), {
    kind: "answered",
    answer: "5",
    text: "",
  });
  assert.deepEqual(toOutcome(done, undefined), { kind: "answered", answer: "5", text: "" });
});

test("work that was stopped after the input was placed is stopped, and withdrawn while it waited is skipped", () => {
  assert.deepEqual(toOutcome(placed("aborted"), undefined), { kind: "stopped" });
  assert.deepEqual(toOutcome(unplaced("aborted"), undefined), { kind: "skipped" });
});

test("any other ending without an answer is a failure, in words a person can read", () => {
  assert.deepEqual(toOutcome(placed("model_error", "The model refused the request."), undefined), {
    kind: "failed",
    reason: "The model failed: The model refused the request.",
  });
  assert.deepEqual(toOutcome(placed("model_error"), undefined), { kind: "failed", reason: "The model failed." });
  assert.deepEqual(toOutcome(unplaced("no_model"), undefined), {
    kind: "failed",
    reason: "The agent has no model it can use.",
  });
  assert.deepEqual(toOutcome(placed("faulted", { code: 3 }), undefined), {
    kind: "failed",
    reason: 'The agent hit an internal error: {"code":3}',
  });
  assert.deepEqual(toOutcome(placed("faulted"), undefined), {
    kind: "failed",
    reason: "The agent hit an internal error.",
  });
  assert.deepEqual(toOutcome(placed("reset"), undefined), {
    kind: "failed",
    reason: "The turn ended without an answer (reset).",
  });
});
