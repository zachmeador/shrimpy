import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, Thread } from "../contracts/chat/index.ts";
import { until } from "../lib/testing/index.ts";
import { outcome, refusalOf, startTestChat, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("head moves live in the caller's channels, and events gives what came after a position, at once", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const yours = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  assert.equal(scouts.head.value, 0);
  assert.deepEqual(valueOf(await scouts.events({ after: 0, limit: 10 }, context)), [], "nothing yet, and no waiting for it");

  const dm = valueOf(await yours.openDm({ member: scout.you.id }, context));
  const [main] = (await you.host.get(Channel, { channel: dm.id }, context)).threads.value;
  assert.ok(main);
  const thread = await you.host.get(Thread, { thread: main.id }, context);
  const asked = valueOf(await thread.post({ text: "How full is the disk?", request: "you-1" }, context));

  await until(() => scouts.head.value === asked.seq, "scout's head to move to the post");
  const first = valueOf(await scouts.events({ after: 0, limit: 10 }, context));
  assert.deepEqual(
    first.map((event) => [event.kind, event.message.id]),
    [["posted", asked.id]],
  );

  const scoutsThread = await scout.host.get(Thread, { thread: main.id }, context);
  const answer = valueOf(await scoutsThread.post({ text: "91%.", request: "scout-1" }, context));
  valueOf(await scouts.leaveReceipt({ events: [asked.event], receipt: outcome("answered", { reply: answer.id }) }, context));

  await until(() => scouts.head.value > answer.seq, "scout's head to move past its answer and receipt");
  const after = valueOf(await scouts.events({ after: asked.seq, limit: 10 }, context));
  assert.deepEqual(
    after.map((event) => event.kind),
    ["posted", "receipted"],
  );
  assert.deepEqual(valueOf(await scouts.events({ after: scouts.head.value, limit: 10 }, context)), []);
  refusalOf(await scouts.events({ after: scouts.head.value + 1, limit: 10 }, context));
  await until(() => yours.head.value === scouts.head.value, "your head to reach the same events");

  // What agents say where you only read is in none of your feed.
  const theirs = valueOf(await scouts.openDm({ member: maya.you.id }, context));
  const [between] = (await scout.host.get(Channel, { channel: theirs.id }, context)).threads.value;
  assert.ok(between);
  const said = valueOf(await (await scout.host.get(Thread, { thread: between.id }, context)).post({ text: "Hi, maya.", request: "scout-2" }, context));
  await until(() => scouts.head.value === said.seq, "scout's head to move to its post to maya");
  assert.notEqual(yours.head.value, said.seq);
  assert.ok(valueOf(await yours.events({ after: 0, limit: 10 }, context)).every((event) => event.message.channelId === dm.id));
});
