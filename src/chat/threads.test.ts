import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, Thread } from "../contracts/chat/index.ts";
import { until } from "../lib/testing/index.ts";
import { refusalOf, startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("a client holding a Thread sees a post arrive, and a request ID's first use wins", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const dm = valueOf(await (await you.host.get(Chat, {}, context)).openDm({ member: scout.you.id }, context));
  const [main] = (await you.host.get(Channel, { channel: dm.id }, context)).threads.value;
  assert.ok(main);
  const watching = await you.host.get(Thread, { thread: main.id }, context);
  const talking = await scout.host.get(Thread, { thread: main.id }, context);
  assert.deepEqual(watching.messages.value, []);

  const first = valueOf(await talking.post({ text: "The disk is nearly full.", request: "scout-1" }, context));

  await until(() => watching.messages.value.length === 1, "the post to arrive");
  assert.deepEqual(watching.messages.value, [first]);
  assert.equal(first.author.name, "scout");

  // A retry answers with the first message as it stands, and posts nothing.
  valueOf(await talking.edit({ message: first.id, text: "The disk is at 91%." }, context));
  const retried = valueOf(await talking.post({ text: "The disk is nearly full.", request: "scout-1" }, context));
  assert.equal(retried.id, first.id);
  assert.equal(retried.text, "The disk is at 91%.");
  // The same ID for something else is refused, and posts nothing either.
  refusalOf(await talking.post({ text: "Something else.", request: "scout-1" }, context));
  const read = valueOf(await watching.read({ before: null, limit: 10 }, context));
  assert.deepEqual(
    read.map((message) => message.text),
    ["The disk is at 91%."],
  );
  await until(() => watching.messages.value[0]?.text === "The disk is at 91%.", "the edit to arrive");
  assert.equal(watching.messages.value.length, 1);
});

test("a rename or an archive names the revision it was decided on, so a stale retry can't undo a later one", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const dm = valueOf(await (await you.host.get(Chat, {}, context)).openDm({ member: scout.you.id }, context));
  const side = valueOf(await (await you.host.get(Channel, { channel: dm.id }, context)).createThread({ name: null }, context));
  const yours = await you.host.get(Thread, { thread: side.id }, context);
  const scouts = await scout.host.get(Thread, { thread: side.id }, context);

  const named = valueOf(await yours.rename({ name: "Disk", revision: side.revision }, context));
  const renamed = valueOf(await scouts.rename({ name: "Logs", revision: named.revision }, context));
  // Your first rename again, as a retry after its answer was lost would send it.
  refusalOf(await yours.rename({ name: "Disk", revision: side.revision }, context));
  refusalOf(await yours.archive({ archived: true, revision: named.revision }, context));
  const archived = valueOf(await yours.archive({ archived: true, revision: renamed.revision }, context));

  await until(() => yours.thread.value?.revision === archived.revision, "the thread to show the archive");
  assert.deepEqual([yours.thread.value?.name, yours.thread.value?.archived], ["Logs", true]);
});
