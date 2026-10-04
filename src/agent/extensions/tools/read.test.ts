import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember } from "../../../contracts/chat/index.ts";
import { Refusal } from "../../../lib/refusal/index.ts";
import { until } from "../../../lib/testing/index.ts";
import { scout, zach } from "../../testing/index.ts";
import { startToolRig, type ToolRig } from "./testing/index.ts";

const timeout = 15_000;

/** Say `count` messages in the thread, Zach and Scout taking turns. */
function converse(rig: ToolRig, count: number): void {
  for (let n = 1; n <= count; n++) rig.chat.say(n % 2 === 1 ? zach : scout, rig.thread.id, `message ${String(n)}`);
}

const when = (message: { sentAt: number }): string => new Date(message.sentAt).toISOString().replace(/\.\d{3}Z$/, "Z");

test("the messages of this thread are read oldest first, each as a message is shown when it arrives", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  converse(rig, 2);
  const [first, second] = rig.chat.messages(rig.thread.id);

  const run = await rig.call("read_messages", {});

  assert.deepEqual(run, {
    text: [
      "Messages in this thread, oldest first:",
      "",
      `Zach wrote at ${when(first!)}:`,
      "message 1",
      "",
      `scout wrote at ${when(second!)}:`,
      "message 2",
    ].join("\n"),
    isError: false,
  });
});

test("@name reads the main thread of the DM with that member", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  const { thread } = rig.chat.dm(scout, agentMember("mechanic"));
  rig.chat.say(agentMember("mechanic"), thread.id, "The build is red.");
  converse(rig, 1);

  const run = await rig.call("read_messages", { from: "@mechanic" });

  assert.match(run.text, /^Messages in your DM with mechanic, oldest first:\n\nmechanic wrote at \S+:\nThe build is red\.$/);
  assert.doesNotMatch(run.text, /message 1/);
});

test("a thread with nothing in it says so, and so does reading before its first message", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  assert.deepEqual(await rig.call("read_messages", {}), {
    text: "There are no messages in this thread yet.",
    isError: false,
  });

  converse(rig, 2);
  const [first] = rig.chat.messages(rig.thread.id);
  assert.deepEqual(await rig.call("read_messages", { before: first!.seq }), {
    text: "There are no older messages in this thread.",
    isError: false,
  });
});

test("a long thread is read a page at a time, newest first, and each page says how to get the one before it", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  converse(rig, 25);

  const newest = await rig.call("read_messages", { limit: 10 });
  const lines = (text: string): string[] => text.split("\n").filter((line) => line.startsWith("message "));
  assert.deepEqual(lines(newest.text), Array.from({ length: 10 }, (_, i) => `message ${String(16 + i)}`));
  const oldest = rig.chat.messages(rig.thread.id)[15]!;
  assert.ok(
    newest.text.endsWith(`\n\nThere are older messages. To read them, call read_messages again with before: ${String(oldest.seq)}.`),
    newest.text,
  );

  const middle = await rig.call("read_messages", { limit: 10, before: oldest.seq });
  assert.deepEqual(lines(middle.text), Array.from({ length: 10 }, (_, i) => `message ${String(6 + i)}`));
  const earliest = rig.chat.messages(rig.thread.id)[5]!;

  const start = await rig.call("read_messages", { limit: 10, before: earliest.seq });
  assert.deepEqual(lines(start.text), Array.from({ length: 5 }, (_, i) => `message ${String(1 + i)}`));
  assert.doesNotMatch(start.text, /older messages/, "the last page says nothing about more");
});

test("20 messages are read when the model does not say how many", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  converse(rig, 30);

  const run = await rig.call("read_messages", {});

  assert.equal(run.text.split("\n").filter((line) => /^message \d+$/.test(line)).length, 20);
  assert.match(run.text, /message 30\n\nThere are older messages\./);
});

test("when the thread read is not this one, the way to read the page before names it", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  const mechanic = agentMember("mechanic");
  const { thread } = rig.chat.dm(scout, mechanic);
  for (let n = 1; n <= 5; n++) rig.chat.say(mechanic, thread.id, `note ${String(n)}`);

  const run = await rig.call("read_messages", { from: "@mechanic", limit: 2 });

  assert.match(run.text, /\n\nThere are older messages\. To read them, call read_messages again with before: \d+ and from: "@mechanic"\.$/);
});

test("when chat is unreachable nothing is read, and the model is told to try later, without waiting", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  rig.reachable(false);

  const run = await rig.call("read_messages", {});

  assert.deepEqual(run, { text: "Not read: chat is unreachable right now. Try again later.", isError: true });
  assert.equal(rig.chat.calls("read"), 0);
});

test("a connection that drops while reading is the same as chat being unreachable", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  const held = rig.chat.hold("read");

  const calling = rig.call("read_messages", {});
  await until(() => held.arrived() === 1, "the read to be out");
  rig.chat.down();

  assert.deepEqual(await calling, { text: "Not read: chat is unreachable right now. Try again later.", isError: true });
});

test("chat that refuses the read says why", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  rig.chat.fail("read", new Refusal("Unknown thread: th_gone"));

  assert.deepEqual(await rig.call("read_messages", {}), {
    text: "Not read: chat did not accept it (Unknown thread: th_gone).",
    isError: true,
  });
});

test("a place that can't be used is said in words the model can act on", { timeout }, async (t) => {
  const rig = await startToolRig(t, { inThread: false });

  assert.equal(
    (await rig.call("read_messages", {})).text,
    "This session is not in a thread, so there is no thread to read by default. Say which with from: @name.",
  );
  assert.equal(
    (await rig.call("read_messages", { from: "mechanic" })).text,
    "from should be @name, such as @zach: the name of someone you have a DM with. Leave it out to read this thread.",
  );
  assert.equal(
    (await rig.call("read_messages", { from: "@nobody" })).text,
    "You have no DM with @nobody, so there is nothing to read. A DM exists once one of you has written to the other.",
  );
  assert.equal((await rig.call("read_messages", { from: "@scout" })).text, "@scout is you. Leave from out to read this thread.");
});
