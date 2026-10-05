import assert from "node:assert/strict";
import { test } from "node:test";
import { startToolRig } from "./testing/index.ts";

const timeout = 15_000;

test("a long thread is read a page at a time, newest first, and each page says which number reads the one before it", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  for (let n = 1; n <= 25; n++) {
    if (n % 2 === 1) await rig.say(`message ${String(n)}`);
    else await rig.postAsScout(`message ${String(n)}`);
  }
  const lines = (text: string): string[] => text.split("\n").filter((line) => line.startsWith("message "));
  const messages = await rig.said();

  const newest = await rig.call("read_messages", { limit: 10 });
  assert.deepEqual(lines(newest.text), Array.from({ length: 10 }, (_, i) => `message ${String(16 + i)}`));
  const oldest = messages[15]!;
  assert.ok(newest.text.includes(`before: ${String(oldest.seq)}`), newest.text);

  const middle = await rig.call("read_messages", { limit: 10, before: oldest.seq });
  assert.deepEqual(lines(middle.text), Array.from({ length: 10 }, (_, i) => `message ${String(6 + i)}`));

  const start = await rig.call("read_messages", { limit: 10, before: messages[5]!.seq });
  assert.deepEqual(lines(start.text), Array.from({ length: 5 }, (_, i) => `message ${String(1 + i)}`));
  assert.doesNotMatch(start.text, /older messages/, "the last page says nothing about more");
});
