import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { enterAsPerson } from "../contracts/chat/testing/index.ts";
import { settle, stopAfter, waitForView } from "../lib/testing/index.ts";
import { startChat } from "./index.ts";
import { follow, outcome, startDm } from "./testing/index.ts";

const timeout = 30_000;

test("a receipt shows on its message in an attached view, and a later one replaces it", { timeout }, async (t) => {
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

test("a receipt is not an event: it is never offered", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  const asked = await zach.chat.post(main.id, "are you there", "zach-1");
  const start = await zach.chat.head();
  const waiting = follow(zach.chat.feed(start, 10));

  await shrimpy.chat.leaveReceipt([asked.event], outcome("silent"));
  await shrimpy.chat.leaveReceipt([asked.event], outcome("stopped"));
  await settle();

  assert.equal(waiting.done, false);
  assert.equal(await zach.chat.head(), start);
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
  const again = await enterAsPerson(t, restarted.endpoint);

  const [message] = await again.chat.read(main.id, null, 10);
  assert.deepEqual(message?.receipts, [
    { memberId: shrimpy.me.id, event: asked.event, status: "answered", reply: answer.id, detail: null },
  ]);
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

  // A call whose answer was lost is made again.
  await shrimpy.chat.leaveReceipt([first.event, second.event], outcome("answered", { reply: answer.id }));
  await shrimpy.chat.leaveReceipt([first.event, second.event], outcome("answered", { reply: answer.id }));

  const left = (event: string) => [{ memberId: shrimpy.me.id, event, status: "answered", reply: answer.id, detail: null }];
  assert.deepEqual(
    (await zach.chat.read(main.id, null, 10)).map((message) => message.receipts),
    [left(first.event), left(second.event), []],
  );
});
