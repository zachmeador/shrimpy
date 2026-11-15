import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, Thread } from "../contracts/chat/index.ts";
import { linkTestAgent } from "../contracts/gateway/testing/index.ts";
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
  const [main] = (await scout.host.get(Channel, { channel: room.id }, context)).threads.value;
  assert.ok(main);
  const thread = await maya.host.get(Thread, { thread: main.id }, context);
  valueOf(await thread.post({ text: "Disk is at 91%.", request: "maya-1" }, context));

  const yours = await you.host.get(Chat, {}, context);
  assert.deepEqual(yours.channels.value, []);
  assert.deepEqual(
    yours.readOnlyChannels.value.map((channel) => channel.id),
    [room.id],
  );
  const reading = await you.host.get(Thread, { thread: main.id }, context);
  assert.equal(reading.refusal.value, null);
  assert.equal(reading.readOnly.value, true);
  assert.deepEqual(
    reading.messages.value.map((message) => message.text),
    ["Disk is at 91%."],
  );
  refusalOf(await reading.post({ text: "Can I join?", request: "you-1" }, context));
  assert.equal(reading.messages.value.length, 1, "the refused post wrote nothing");

  // An agent that is not in the room can't have it at all, until it is added.
  const rex = await chat.agent("rex");
  const outside = await rex.host.get(Thread, { thread: main.id }, context);
  assert.notEqual(outside.refusal.value, null);
  assert.equal(outside.thread.value, null);
  assert.deepEqual(outside.messages.value, []);
  valueOf(await (await scout.host.get(Channel, { channel: room.id }, context)).addMembers({ members: [rex.you.id] }, context));
  await until(() => outside.refusal.value === null, "rex's hold of the thread to have it once rex is in the room");
  assert.equal(outside.messages.value.length, 1);
  assert.equal(outside.readOnly.value, false);

  // Adding yourself makes the room yours, and the same hold can write in it.
  const channel = await you.host.get(Channel, { channel: room.id }, context);
  valueOf(await channel.addMembers({ members: [you.you?.id ?? ""] }, context));
  await until(() => !reading.readOnly.value, "the thread to stop being read-only");
  valueOf(await reading.post({ text: "Thanks for the update.", request: "you-2" }, context));
  await until(() => yours.channels.value.length === 1, "the room to become one of your channels");
  assert.deepEqual(yours.readOnlyChannels.value, []);
});

test("an agent renamed on the roster is the same member, named so in the channels and messages it is in", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const yours = await you.host.get(Chat, {}, context);
  const dm = valueOf(await yours.openDm({ member: scout.you.id }, context));
  const [main] = (await you.host.get(Channel, { channel: dm.id }, context)).threads.value;
  assert.ok(main);
  const watching = await you.host.get(Thread, { thread: main.id }, context);
  valueOf(await (await scout.host.get(Thread, { thread: main.id }, context)).post({ text: "Hello.", request: "scout-1" }, context));

  // An agent's program that links under another name renames it.
  await scout.stop();
  const renamed = await linkTestAgent(t, "scouty", { token: scout.token });
  assert.equal(renamed.you.id, scout.you.id);

  await until(() => yours.channels.value[0]?.name === "scouty", "the DM to be named for scouty");
  await until(() => watching.messages.value[0]?.author.name === "scouty", "the message to name its author scouty");
  assert.equal((await renamed.host.get(Chat, {}, context)).channels.value[0]?.id, dm.id, "with its channels");
});
