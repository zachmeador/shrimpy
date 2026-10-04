import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import type { ChatEvent } from "../contracts/chat/index.ts";
import { enterAsPerson } from "../contracts/chat/testing/index.ts";
import { stopAfter, waitForView } from "../lib/testing/index.ts";
import { startChat } from "./index.ts";
import { logOf, outcome, startDm } from "./testing/index.ts";

const timeout = 30_000;

type Receipted = Extract<ChatEvent, { kind: "receipted" }>;
const receipts = (events: ChatEvent[]): Receipted[] =>
  events.filter((event): event is Receipted => event.kind === "receipted");

test("a receipt that replaces an earlier one is a second event, and the message shows the one that stands", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  const watching = await zach.attach(main.id);
  const asked = await zach.chat.post(main.id, "are you there", "zach-1");
  await waitForView(watching, (view) => view.messages.length === 1);

  await shrimpy.chat.leaveReceipt([asked.event], outcome("skipped"));
  const skipped = await waitForView(watching, (view) => view.messages[0]?.receipts.length === 1);
  assert.deepEqual(skipped.messages[0]?.receipts, [
    { memberId: shrimpy.me.id, event: asked.event, status: "skipped", reply: null, detail: null },
  ]);

  const answer = await shrimpy.chat.post(main.id, "Yes.", "shrimpy-1");
  await shrimpy.chat.leaveReceipt([asked.event], outcome("answered", { reply: answer.id }));
  const answered = await waitForView(watching, (view) => view.messages[0]?.receipts[0]?.status === "answered");
  assert.deepEqual(answered.messages[0]?.receipts, [
    { memberId: shrimpy.me.id, event: asked.event, status: "answered", reply: answer.id, detail: null },
  ]);
  assert.deepEqual(answered.messages[1]?.receipts, []);

  // Leaving what stands again is a repeat, and writes nothing.
  await shrimpy.chat.leaveReceipt([asked.event], outcome("answered", { reply: answer.id }));

  const log = await zach.chat.feed(0, 10);
  assert.deepEqual(logOf(log), ["posted: are you there", "receipted: skipped", "posted: Yes.", "receipted: answered"]);
  const [first, second] = receipts(log);
  assert.ok(first && second);
  assert.notEqual(first.id, second.id);
  assert.deepEqual([first.event, second.event], [asked.event, asked.event], "both answer the post");
  assert.deepEqual([first.message.id, second.message.id], [asked.id, asked.id], "and name its message, not the reply");
  assert.deepEqual([first.reply, second.reply], [null, answer.id]);
});

test("a receipt leaves the thread's time alone", { timeout }, async (t) => {
  const { zach, shrimpy, dm, main } = await startDm(t);
  const watching = await zach.attach(main.id);
  const asked = await zach.chat.post(main.id, "are you there", "zach-1");
  const posted = await waitForView(watching, (view) => view.messages.length === 1);
  await wait(5);

  await shrimpy.chat.leaveReceipt([asked.event], outcome("silent"));

  const view = await waitForView(watching, (current) => current.messages[0]?.receipts.length === 1);
  assert.equal(view.thread.updatedAt, posted.thread.updatedAt);
  assert.equal((await zach.chat.threads(dm.id))[0]?.updatedAt, asked.sentAt);
});

test("a receipt is an event: the feed offers it after the reply it points at, to a member who was waiting too", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  const asked = await zach.chat.post(main.id, "are you there", "zach-1");
  const answer = await shrimpy.chat.post(main.id, "Yes.", "shrimpy-1");
  const waiting = zach.chat.feed(answer.seq, 10);

  await shrimpy.chat.leaveReceipt([asked.event], outcome("answered", { reply: answer.id }));

  const [offered, ...others] = await waiting;
  assert.deepEqual(others, []);
  assert.ok(offered?.kind === "receipted");
  assert.ok(offered.seq > answer.seq, "after the reply");
  assert.deepEqual(
    [offered.actor, offered.message.id, offered.event, offered.status, offered.reply, offered.detail, offered.receipts],
    [shrimpy.me, asked.id, asked.event, "answered", answer.id, null, []],
    "the agent's receipt on the post, naming the question and pointing at the reply",
  );
  assert.deepEqual(logOf(await zach.chat.feed(0, 10)), ["posted: are you there", "posted: Yes.", "receipted: answered"]);
  assert.deepEqual(logOf(await shrimpy.chat.feed(0, 10)), ["posted: are you there", "posted: Yes.", "receipted: answered"], "its own too");
});

test("an event offered after its receipt carries the receipt", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  const asked = await zach.chat.post(main.id, "are you there", "zach-1");
  await shrimpy.chat.leaveReceipt([asked.event], outcome("failed", { detail: "No model was reachable." }));

  const [offered] = await zach.chat.feed(0, 10);

  assert.deepEqual(offered?.receipts, [
    { memberId: shrimpy.me.id, event: asked.event, status: "failed", reply: null, detail: "No model was reachable." },
  ]);
});

test("a receipt survives the chat server restarting", { timeout }, async (t) => {
  const { chat, zach, shrimpy, main } = await startDm(t);
  const asked = await zach.chat.post(main.id, "are you there", "zach-1");
  const answer = await shrimpy.chat.post(main.id, "Yes.", "shrimpy-1");
  await shrimpy.chat.leaveReceipt([asked.event], outcome("answered", { reply: answer.id }));

  await chat.chat.close();
  const restarted = await startChat({ dataDir: chat.dataDir });
  stopAfter(t, () => restarted.close());
  const again = await enterAsPerson(t);

  const [message] = await again.chat.read(main.id, null, 10);
  assert.deepEqual(message?.receipts, [
    { memberId: shrimpy.me.id, event: asked.event, status: "answered", reply: answer.id, detail: null },
  ]);
  assert.deepEqual(logOf(await again.chat.feed(0, 10)), ["posted: are you there", "posted: Yes.", "receipted: answered"]);
});

test("one receipt call covers several events, all or none, and repeating it changes nothing", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  const first = await zach.chat.post(main.id, "one", "zach-1");
  const second = await zach.chat.post(main.id, "two", "zach-2");
  const answer = await shrimpy.chat.post(main.id, "one and two", "shrimpy-1");

  await assert.rejects(shrimpy.chat.leaveReceipt([first.event], outcome("answered")), {
    code: "service_invalid_value",
    message: /^An answered receipt needs a reply/,
  });
  await assert.rejects(shrimpy.chat.leaveReceipt([first.event], outcome("answered", { reply: first.id })), {
    message: /is not a message you wrote/,
  });
  await assert.rejects(shrimpy.chat.leaveReceipt([first.event, "evt_nothing"], outcome("silent")), {
    message: /^Unknown event: evt_nothing/,
  });
  assert.deepEqual(
    (await zach.chat.read(main.id, null, 10)).map((message) => message.receipts),
    [[], [], []],
  );
  assert.deepEqual(logOf(await zach.chat.feed(0, 10)), ["posted: one", "posted: two", "posted: one and two"]);

  // A call whose answer was lost is made again.
  await shrimpy.chat.leaveReceipt([first.event, second.event], outcome("answered", { reply: answer.id }));
  const written = await zach.chat.head();
  await shrimpy.chat.leaveReceipt([first.event, second.event], outcome("answered", { reply: answer.id }));

  const left = (event: string) => [{ memberId: shrimpy.me.id, event, status: "answered", reply: answer.id, detail: null }];
  assert.deepEqual(
    (await zach.chat.read(main.id, null, 10)).map((message) => message.receipts),
    [left(first.event), left(second.event), []],
  );
  assert.equal(await zach.chat.head(), written, "the repeat wrote nothing");
  const log = await zach.chat.feed(0, 10);
  assert.deepEqual(logOf(log).slice(3), ["receipted: answered", "receipted: answered"], "one event for each event, in the order given");
  assert.deepEqual(
    receipts(log).map((event) => event.event),
    [first.event, second.event],
  );
});

test("a receipt can't be left on the event of a receipt, and the try writes nothing", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  const asked = await zach.chat.post(main.id, "are you there", "zach-1");
  await shrimpy.chat.leaveReceipt([asked.event], outcome("silent"));
  const [receipt] = receipts(await zach.chat.feed(0, 10));
  assert.ok(receipt);
  const written = await zach.chat.head();

  await assert.rejects(shrimpy.chat.leaveReceipt([receipt.id], outcome("silent")), {
    code: "service_invalid_value",
    message: /is a receipt/,
  });
  // The call is all or nothing, so the event that could have had its receipt changed keeps the one it had.
  await assert.rejects(shrimpy.chat.leaveReceipt([asked.event, receipt.id], outcome("stopped")), {
    message: /is a receipt/,
  });

  assert.equal(await zach.chat.head(), written);
  assert.deepEqual(
    (await zach.chat.read(main.id, null, 10)).map((message) => message.receipts.map((each) => each.status)),
    [["silent"]],
  );
});
