import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as wait } from "node:timers/promises";
import { settle, waitForView } from "../lib/testing/index.ts";
import { agent, startDm } from "./testing/index.ts";

const timeout = 30_000;

test("who is working shows in threads and in another member's live view, until it is cleared", { timeout }, async (t) => {
  const { zach, shrimpy, dm, main } = await startDm(t);
  const watching = await zach.attach(main.id);
  assert.deepEqual(watching.view.thread.working, []);

  await shrimpy.chat.setWorking(main.id, true);

  const working = await waitForView(watching, (view) => view.thread.working.length === 1);
  const [mark] = working.thread.working;
  assert.ok(mark);
  assert.equal(mark.memberId, agent("Shrimpy").id);
  assert.ok(mark.since > 0);
  assert.equal(working.thread.updatedAt, main.updatedAt);
  assert.deepEqual((await zach.chat.threads(dm.id))[0]?.working, [mark]);
  assert.deepEqual((await shrimpy.chat.threads(dm.id))[0]?.working, [mark]);

  await shrimpy.chat.setWorking(main.id, false);
  await waitForView(watching, (view) => view.thread.working.length === 0);
  assert.deepEqual((await zach.chat.threads(dm.id))[0]?.working, []);
});

test("marking work twice keeps the time it started", { timeout }, async (t) => {
  const { zach, shrimpy, dm, main } = await startDm(t);
  await shrimpy.chat.setWorking(main.id, true);
  const [first] = (await zach.chat.threads(dm.id))[0]?.working ?? [];
  assert.ok(first);

  await wait(20);
  await shrimpy.chat.setWorking(main.id, true);

  assert.deepEqual((await zach.chat.threads(dm.id))[0]?.working, [first]);
});

test("a mark ends with the connection that made it", { timeout }, async (t) => {
  const { zach, shrimpy, dm, main } = await startDm(t);
  const watching = await zach.attach(main.id);
  await shrimpy.chat.setWorking(main.id, true);
  await waitForView(watching, (view) => view.thread.working.length === 1);

  await shrimpy.close();

  await waitForView(watching, (view) => view.thread.working.length === 0);
  assert.deepEqual((await zach.chat.threads(dm.id))[0]?.working, []);
});

test("a member marked from two connections works until both have cleared or ended", { timeout }, async (t) => {
  const { chat, zach, shrimpy, main } = await startDm(t);
  const other = await chat.join(agent("Shrimpy"));
  const watching = await zach.attach(main.id);
  await shrimpy.chat.setWorking(main.id, true);
  const started = await waitForView(watching, (view) => view.thread.working.length === 1);
  await other.chat.setWorking(main.id, true);

  await shrimpy.chat.setWorking(main.id, false);
  await settle();
  assert.deepEqual(watching.view.thread.working, started.thread.working);

  await other.close();
  await waitForView(watching, (view) => view.thread.working.length === 0);
});

test("a member that works in two threads shows in each", { timeout }, async (t) => {
  const { zach, shrimpy, dm, main } = await startDm(t);
  const side = await zach.chat.createThread(dm.id, "Side");

  await shrimpy.chat.setWorking(main.id, true);
  await shrimpy.chat.setWorking(side.id, true);
  await shrimpy.chat.setWorking(main.id, false);

  const threads = await zach.chat.threads(dm.id);
  assert.deepEqual(
    threads.map((thread) => [thread.id, thread.working.length]).sort(),
    [[main.id, 0], [side.id, 1]].sort(),
  );
});
