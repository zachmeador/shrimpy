import assert from "node:assert/strict";
import { test } from "node:test";
import type { EntryRecord, SettledSubmissionRecord } from "@earendil-works/pi-durable";
import { toSettlement } from "./settlement.ts";

const base = { id: 7, conversationId: 1, type: "input" } as const;

const done = { ...base, status: "done", entry: 3, answer: 5 } as unknown as SettledSubmissionRecord;

function unanswered(reason: string, detail?: unknown): SettledSubmissionRecord {
  return { ...base, status: "unanswered", reason, detail } as unknown as SettledSubmissionRecord;
}

function answer(content: unknown[]): EntryRecord {
  return { kind: "pi.assistant", model: [{ role: "assistant", content, stopReason: "stop" }] } as unknown as EntryRecord;
}

test("an answered input carries the words of the answer, not its thinking or tool calls", () => {
  const entry = answer([
    { type: "thinking", thinking: "Let me see." },
    { type: "text", text: "The files are " },
    { type: "toolCall", id: "c", name: "bash", arguments: {} },
    { type: "text", text: "a.txt and b.txt." },
  ]);
  assert.deepEqual(toSettlement(done, entry), { status: "answered", text: "The files are a.txt and b.txt." });
});

test("an answer with no words is still an answer", () => {
  assert.deepEqual(toSettlement(done, answer([{ type: "thinking", thinking: "Nothing to say." }])), {
    status: "answered",
    text: "",
  });
  assert.deepEqual(toSettlement(done, undefined), { status: "answered", text: "" });
});

test("work that was stopped is cancelled", () => {
  assert.deepEqual(toSettlement(unanswered("aborted"), undefined), { status: "cancelled" });
});

test("any other ending without an answer says why", () => {
  assert.deepEqual(toSettlement(unanswered("model_error", "The model refused the request."), undefined), {
    status: "unanswered",
    reason: "model_error",
    detail: "The model refused the request.",
  });
  assert.deepEqual(toSettlement(unanswered("reset"), undefined), {
    status: "unanswered",
    reason: "reset",
    detail: null,
  });
  assert.deepEqual(toSettlement(unanswered("faulted", { code: 3 }), undefined), {
    status: "unanswered",
    reason: "faulted",
    detail: '{"code":3}',
  });
});
