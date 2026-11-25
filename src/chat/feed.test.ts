import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat } from "../contracts/chat/index.ts";
import { until } from "../lib/testing/index.ts";
import { outcome, refusalOf, startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("head moves live in the caller's channels, and events gives what came after a position, at once", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const yours = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  assert.equal(scouts.head.value, 0);
  assert.deepEqual(valueOf(await scouts.events({ after: 0, limit: 10 }, context)), [], "nothing yet, and no waiting for it");

  const dm = valueOf(await yours.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await yours.createThread({ channel: dm.id, name: null }, context)).id;
  const asked = valueOf(await yours.post({ thread, text: "How full is the disk?", request: "you-1" }, context));

  await until(() => scouts.head.value === asked.seq, "scout's head to move to the post");
  const first = valueOf(await scouts.events({ after: 0, limit: 10 }, context));
  assert.deepEqual(
    first.map((event) => [event.kind, event.message.id]),
    [["posted", asked.id]],
  );

  const answer = valueOf(await scouts.post({ thread, text: "91%.", request: "scout-1" }, context));
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
  const between = valueOf(await scouts.createThread({ channel: theirs.id, name: null }, context));
  const said = valueOf(await scouts.post({ thread: between.id, text: "Hi, maya.", request: "scout-2" }, context));
  await until(() => scouts.head.value === said.seq, "scout's head to move to its post to maya");
  assert.notEqual(yours.head.value, said.seq);
  assert.ok(valueOf(await yours.events({ after: 0, limit: 10 }, context)).every((event) => event.message.channelId === dm.id));
});

test("a post in the feed keeps the members it mentioned after an edit takes them away", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const yours = await you.host.get(Chat, {}, context);
  const room = valueOf(await yours.createRoom({ name: "Ops", members: [scout.you.id, maya.you.id] }, context));
  const [first] = (await you.host.get(Channel, { channel: room.id }, context)).threads.value;
  assert.ok(first);
  const asked = valueOf(await yours.post({ thread: first.id, text: "@scout, can you look?", request: "you-1" }, context));
  const edited = valueOf(await yours.edit({ message: asked.id, text: "@maya, can you look instead?", request: "you-2" }, context));
  assert.deepEqual(edited.mentions, [maya.you.id]);

  const scouts = await scout.host.get(Chat, {}, context);
  await until(() => scouts.head.value > asked.seq, "scout's head to move past the edit");
  const feed = valueOf(await scouts.events({ after: 0, limit: 10 }, context));
  assert.deepEqual(
    feed.map((event) => [event.kind, "mentions" in event ? event.mentions : null, event.message.mentions]),
    [
      ["posted", [scout.you.id], [maya.you.id]],
      ["edited", [maya.you.id], [maya.you.id]],
    ],
    "each event has whom it mentioned, and its message whom it mentions now",
  );
});
