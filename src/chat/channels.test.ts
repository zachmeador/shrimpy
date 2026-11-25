import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, Thread } from "../contracts/chat/index.ts";
import { until } from "../lib/testing/index.ts";
import { refusalOf, startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("a client holding Chat sees a DM it opens appear in its channels, and so does the member it opened it with", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const yours = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  assert.equal(yours.you.value?.id, you.you?.id);
  assert.equal(scouts.you.value?.name, "scout");
  assert.deepEqual(yours.channels.value, []);

  const dm = valueOf(await yours.openDm({ member: scout.you.id }, context));

  await until(() => yours.channels.value.length === 1, "the DM to appear in your channels");
  assert.deepEqual(yours.channels.value, [dm]);
  assert.equal(dm.name, "scout", "a DM is named for the other member");
  await until(() => scouts.channels.value.length === 1, "the DM to appear in scout's channels");
  assert.equal(scouts.channels.value[0]?.id, dm.id);
  assert.deepEqual(yours.readOnlyChannels.value, []);
});

test("you read a channel you are not in, with its thread read-only and a post there refused, until you are in it", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  // The first agent a roster has is an admin.
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const scouts = await scout.host.get(Chat, {}, context);

  const room = valueOf(await scouts.createRoom({ name: "Ops", members: [maya.you.id] }, context));
  const [first] = (await scout.host.get(Channel, { channel: room.id }, context)).threads.value;
  assert.ok(first);
  const thread = first.id;
  valueOf(await (await maya.host.get(Chat, {}, context)).post({ thread, text: "Disk is at 91%.", request: "maya-1" }, context));

  const yours = await you.host.get(Chat, {}, context);
  assert.deepEqual(yours.channels.value, []);
  assert.deepEqual(
    yours.readOnlyChannels.value.map((channel) => channel.id),
    [room.id],
  );
  const reading = await you.host.get(Thread, { thread }, context);
  assert.equal(reading.refusal.value, null);
  assert.equal(reading.readOnly.value, true);
  assert.deepEqual(
    reading.messages.value.map((message) => message.text),
    ["Disk is at 91%."],
  );
  refusalOf(await yours.post({ thread, text: "Can I join?", request: "you-1" }, context));
  assert.equal(reading.messages.value.length, 1, "the refused post wrote nothing");

  // An agent that is not in the room can't have it at all, until it is added.
  const rex = await chat.agent("rex");
  const outside = await rex.host.get(Thread, { thread }, context);
  assert.notEqual(outside.refusal.value, null);
  assert.equal(outside.thread.value, null);
  assert.deepEqual(outside.messages.value, []);
  valueOf(await scouts.addMembers({ channel: room.id, members: [rex.you.id] }, context));
  await until(() => outside.refusal.value === null, "rex's hold of the thread to have it once rex is in the room");
  assert.equal(outside.messages.value.length, 1);
  assert.equal(outside.readOnly.value, false);

  // Adding yourself makes the room yours, and the same hold can write in it.
  valueOf(await yours.addMembers({ channel: room.id, members: [you.you?.id ?? ""] }, context));
  await until(() => !reading.readOnly.value, "the thread to stop being read-only");
  valueOf(await yours.post({ thread, text: "Thanks for the update.", request: "you-2" }, context));
  await until(() => yours.channels.value.length === 1, "the room to become one of your channels");
  assert.deepEqual(yours.readOnlyChannels.value, []);
});

test("a person renamed in settings.json is the same member, named so in the channels and messages they are in", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const yours = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  const dm = valueOf(await yours.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await yours.createThread({ channel: dm.id, name: null }, context));
  const watching = await scout.host.get(Thread, { thread: thread.id }, context);
  valueOf(await yours.post({ thread: thread.id, text: "Hello.", request: "you-1" }, context));

  mkdirSync(chat.gateway.folder, { recursive: true });
  writeFileSync(join(chat.gateway.folder, "settings.json"), JSON.stringify({ name: "zachary" }));

  await until(() => scouts.channels.value[0]?.name === "zachary", "the DM to be named for zachary");
  await until(() => watching.messages.value[0]?.author.name === "zachary", "the message to name its author zachary");
  assert.equal(yours.channels.value[0]?.id, dm.id, "with your channels");
});
