import assert from "node:assert/strict";
import { test } from "node:test";
import { settle, waitForView } from "../lib/testing/index.ts";
import { person, startDm } from "./testing/index.ts";

const timeout = 30_000;

test("an attached thread's view follows the thread as messages arrive", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);

  const watching = await zach.attach(main.id);
  assert.equal(watching.id, main.id);
  assert.deepEqual(watching.view, { thread: main, messages: [], earlier: 0 });

  const hello = await shrimpy.chat.post(main.id, "hello", "shrimpy-1");
  const first = await waitForView(watching, (view) => view.messages.length === 1);
  assert.deepEqual(first.messages, [hello]);
  assert.equal(first.thread.preview, "hello");
  assert.equal(first.thread.updatedAt, hello.sentAt);

  const reply = await zach.chat.post(main.id, "hi", "zach-1");
  const second = await waitForView(watching, (view) => view.messages.length === 2);
  assert.deepEqual(second.messages, [hello, reply]);
  assert.equal(second.thread.preview, "hello");
  assert.equal(second.thread.updatedAt, reply.sentAt);
  assert.deepEqual(watching.view, second);
});

test("a long thread's view holds its newest 200 messages and counts the rest", { timeout }, async (t) => {
  const { zach, main } = await startDm(t);
  const watching = await zach.attach(main.id);
  for (let number = 1; number <= 205; number++) {
    await zach.chat.post(main.id, `message ${number}`, `zach-${number}`);
  }

  const view = await waitForView(watching, (current) => current.messages.at(-1)?.text === "message 205");

  assert.equal(view.messages.length, 200);
  assert.equal(view.earlier, 5);
  const [oldest] = view.messages;
  assert.ok(oldest);
  assert.equal(oldest.text, "message 6");
  const earlier = await zach.chat.read(main.id, oldest.seq, 10);
  assert.deepEqual(
    earlier.map((message) => message.text),
    ["message 1", "message 2", "message 3", "message 4", "message 5"],
  );
});

test("several clients watch one thread and see the same view, and one leaving does not stop the others", { timeout }, async (t) => {
  const { chat, zach, shrimpy, main } = await startDm(t);
  const another = await chat.join(person("Zach"));
  const watchers = await Promise.all([zach, shrimpy, another].map((connection) => connection.attach(main.id)));

  await zach.chat.post(main.id, "to everyone", "zach-1");

  const views = await Promise.all(watchers.map((watcher) => waitForView(watcher, (view) => view.messages.length === 1)));
  assert.deepEqual(views[1], views[0]);
  assert.deepEqual(views[2], views[0]);

  await another.detach();
  await zach.chat.post(main.id, "to the two that stayed", "zach-2");
  await Promise.all(watchers.slice(0, 2).map((watcher) => waitForView(watcher, (view) => view.messages.length === 2)));
});

test("a connection watches one thread at a time", { timeout }, async (t) => {
  const { zach, shrimpy, dm, main } = await startDm(t);
  const side = await zach.chat.createThread(dm.id, "Side");

  await zach.attach(main.id);
  const second = await zach.attach(side.id);
  await shrimpy.chat.post(main.id, "in the main thread", "shrimpy-1");
  await shrimpy.chat.post(side.id, "in the side thread", "shrimpy-2");

  const view = await waitForView(second, (current) => current.messages.length === 1);
  assert.equal(second.id, side.id);
  assert.equal(view.thread.id, side.id);
  assert.deepEqual(view.messages.map((message) => message.text), ["in the side thread"]);
});

test("detaching stops the updates, and the connection can attach again", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  const watching = await zach.attach(main.id);
  let views = 0;
  watching.subscribe(() => {
    views += 1;
  });
  assert.equal(views, 1);

  await zach.detach();
  await shrimpy.chat.post(main.id, "while detached", "shrimpy-1");
  await settle();
  assert.equal(views, 1);
  assert.throws(() => watching.view, /Thread th_\w+ is no longer attached/);
  assert.throws(() => watching.subscribe(() => undefined), /no longer attached/);

  const again = await zach.attach(main.id);
  assert.equal(again.view.messages.length, 1);
});
