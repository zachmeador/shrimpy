import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, Thread } from "../contracts/chat/index.ts";
import { Roster } from "../contracts/gateway/index.ts";
import { newToken, sayHello } from "../contracts/gateway/node.ts";
import { connectTestClient, startTestGateway } from "../contracts/gateway/testing/index.ts";
import { until } from "../lib/testing/index.ts";
import { refusalOf, startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("what is new to you is what others wrote after your read mark, never your own, and the mark only moves forward", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const dm = valueOf(await (await you.host.get(Chat, {}, context)).openDm({ member: scout.you.id }, context));
  const channel = await you.host.get(Channel, { channel: dm.id }, context);
  const [main] = channel.threads.value;
  assert.ok(main);
  const yours = await you.host.get(Thread, { thread: main.id }, context);
  const scouts = await scout.host.get(Thread, { thread: main.id }, context);
  assert.equal(yours.unread.value, 0);
  assert.deepEqual(channel.unread.value, { [main.id]: 0 });

  const first = valueOf(await scouts.post({ text: "The disk is at 91%.", request: "scout-1" }, context));
  const second = valueOf(await scouts.post({ text: "It grows by a gigabyte a day.", request: "scout-2" }, context));
  valueOf(await yours.post({ text: "What is filling it?", request: "you-1" }, context));
  const third = valueOf(await scouts.post({ text: "Old logs in /var/log.", request: "scout-3" }, context));
  await until(() => yours.messages.value.length === 4, "the four messages to arrive");
  assert.equal(yours.unread.value, 3, "scout's three are new to you, and yours is not");
  await until(() => channel.unread.value?.[main.id] === 3, "the channel to count them in the thread");

  valueOf(await yours.markRead({ message: second.id }, context));
  await until(() => yours.unread.value === 1, "only what scout wrote after the mark to be new");
  // Anything a call changed reaches its holder before the call's answer does.
  valueOf(await yours.markRead({ message: first.id }, context));
  assert.equal(yours.unread.value, 1, "a mark never moves back");

  valueOf(await yours.markRead({ message: third.id }, context));
  await until(() => channel.unread.value?.[main.id] === 0, "nothing to be new once the mark is at the newest");
  valueOf(await yours.post({ text: "I'll clear them.", request: "you-2" }, context));
  await until(() => yours.messages.value.length === 5, "your message to arrive");
  assert.equal(yours.unread.value, 0, "your own message is never new to you");

  // A side thread counts on its own.
  const side = valueOf(await channel.createThread({ name: "backups" }, context));
  valueOf(await (await scout.host.get(Thread, { thread: side.id }, context)).post({ text: "Backups are fine.", request: "scout-4" }, context));
  await until(() => channel.unread.value?.[side.id] === 1, "the side thread's message to be new");
  assert.deepEqual(channel.unread.value, { [main.id]: 0, [side.id]: 1 });

  // An agent keeps no marks.
  assert.equal(scouts.unread.value, null);
  assert.equal((await scout.host.get(Channel, { channel: dm.id }, context)).unread.value, null);
  refusalOf(await scouts.markRead({ message: third.id }, context));
});

test("when one client of yours moves a read mark, another of yours, on a device, sees what is new follow", { timeout }, async (t) => {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const chat = await startChatInProcess(t);
  const terminal = await chat.person();
  const scout = await chat.agent("scout");
  const invitation = valueOf(await (await terminal.host.get(Roster, {}, context)).inviteDevice(context));
  const [address] = gateway.listening.listen;
  assert.ok(address);
  const entry = { ...address, fingerprint: invitation.fingerprint };
  const token = newToken();
  const joined = await sayHello(entry, { kind: "join", name: null, token, code: invitation.code });
  joined.linked.drop();
  const phone = await connectTestClient(t, entry, token);

  const dm = valueOf(await (await terminal.host.get(Chat, {}, context)).openDm({ member: scout.you.id }, context));
  const [main] = (await terminal.host.get(Channel, { channel: dm.id }, context)).threads.value;
  assert.ok(main);
  const said = valueOf(await (await scout.host.get(Thread, { thread: main.id }, context)).post({ text: "Done.", request: "scout-1" }, context));
  const onPhone = await phone.host.get(Thread, { thread: main.id }, context);
  const phoneChannel = await phone.host.get(Channel, { channel: dm.id }, context);
  await until(() => onPhone.unread.value === 1 && phoneChannel.unread.value?.[main.id] === 1, "scout's message to be new on the phone");

  valueOf(await (await terminal.host.get(Thread, { thread: main.id }, context)).markRead({ message: said.id }, context));

  await until(() => onPhone.unread.value === 0, "the phone's thread to follow the mark the terminal moved");
  await until(() => phoneChannel.unread.value?.[main.id] === 0, "and its channel");
});
