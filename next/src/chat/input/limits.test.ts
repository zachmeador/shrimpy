import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message } from "../../contracts/chat/index.ts";
import { fitAnswer } from "./limits.ts";

function message(seq: number, text: string): Message {
  return {
    id: `msg_${String(seq)}`,
    seq,
    channelId: "ch_1",
    threadId: "th_1",
    author: { id: "person:zach", kind: "person", name: "Zach" },
    text,
    sentAt: seq,
    addressed: [],
    receipts: [],
  };
}

const sizeOf = (one: Message): number => Buffer.byteLength(JSON.stringify(one));
const seqs = (messages: Message[]): number[] => messages.map((one) => one.seq);

test("messages that fit are all kept, in order", () => {
  const messages = [message(1, "one"), message(2, "two"), message(3, "three")];

  assert.deepEqual(fitAnswer(messages, "newest"), messages);
  assert.deepEqual(fitAnswer(messages, "oldest"), messages);
  assert.deepEqual(fitAnswer([], "newest"), []);
});

test("past the budget, the kept end stays and the other end goes", () => {
  const messages = [1, 2, 3, 4].map((seq) => message(seq, "x".repeat(100)));
  const budget = sizeOf(message(1, "x".repeat(100))) * 2;

  assert.deepEqual(seqs(fitAnswer(messages, "newest", budget)), [3, 4]);
  assert.deepEqual(seqs(fitAnswer(messages, "oldest", budget)), [1, 2]);
});

test("size is counted in bytes as sent, so wide and escaped characters count for more", () => {
  const plain = [1, 2].map((seq) => message(seq, "x".repeat(100)));
  const wide = [1, 2].map((seq) => message(seq, "é".repeat(100)));
  const escaped = [1, 2].map((seq) => message(seq, "\u0001".repeat(100)));
  const budget = sizeOf(message(1, "x".repeat(100))) * 2;

  assert.equal(fitAnswer(plain, "newest", budget).length, 2);
  assert.equal(fitAnswer(wide, "newest", budget).length, 1);
  assert.equal(fitAnswer(escaped, "newest", budget).length, 1);
});

test("one message is always kept, even alone over the budget", () => {
  const messages = [message(1, "x".repeat(100)), message(2, "y".repeat(100))];

  assert.deepEqual(seqs(fitAnswer(messages, "newest", 1)), [2]);
  assert.deepEqual(seqs(fitAnswer(messages, "oldest", 1)), [1]);
});
