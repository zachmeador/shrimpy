import assert from "node:assert/strict";
import { test } from "node:test";
import { fitAnswer } from "./limits.ts";

/** Anything that is sent as JSON will do: a message or an event. */
const item = (seq: number, text: string): { seq: number; text: string } => ({ seq, text });

const sizeOf = (one: { seq: number; text: string }): number => Buffer.byteLength(JSON.stringify(one));
const seqs = (items: { seq: number }[]): number[] => items.map((one) => one.seq);

test("past the budget, the kept end stays and the other end goes", () => {
  const items = [1, 2, 3, 4].map((seq) => item(seq, "x".repeat(100)));
  const budget = sizeOf(item(1, "x".repeat(100))) * 2;

  assert.deepEqual(seqs(fitAnswer(items, "newest", budget)), [3, 4]);
  assert.deepEqual(seqs(fitAnswer(items, "oldest", budget)), [1, 2]);
});

test("size is counted in bytes as sent, so wide and escaped characters count for more", () => {
  const plain = [1, 2].map((seq) => item(seq, "x".repeat(100)));
  const wide = [1, 2].map((seq) => item(seq, "é".repeat(100)));
  const escaped = [1, 2].map((seq) => item(seq, "\u0001".repeat(100)));
  const budget = sizeOf(item(1, "x".repeat(100))) * 2;

  assert.equal(fitAnswer(plain, "newest", budget).length, 2);
  assert.equal(fitAnswer(wide, "newest", budget).length, 1);
  assert.equal(fitAnswer(escaped, "newest", budget).length, 1);
});

test("one item is always kept, even alone over the budget", () => {
  const items = [item(1, "x".repeat(100)), item(2, "y".repeat(100))];

  assert.deepEqual(seqs(fitAnswer(items, "newest", 1)), [2]);
  assert.deepEqual(seqs(fitAnswer(items, "oldest", 1)), [1]);
});
