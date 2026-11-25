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
  const yourChat = await you.host.get(Chat, {}, context);
  const scoutsChat = await scout.host.get(Chat, {}, context);
  const dm = valueOf(await yourChat.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await yourChat.createThread({ channel: dm.id, name: null }, context)).id;
  const channel = await you.host.get(Channel, { channel: dm.id }, context);
  const yours = await you.host.get(Thread, { thread }, context);
  const scouts = await scout.host.get(Thread, { thread }, context);
  assert.equal(yours.unread.value, 0);
  assert.equal(channel.unread.value?.[thread], 0);

  const first = valueOf(await scoutsChat.post({ thread, text: "The disk is at 91%.", request: "scout-1" }, context));
  const second = valueOf(await scoutsChat.post({ thread, text: "It grows by a gigabyte a day.", request: "scout-2" }, context));
  valueOf(await yourChat.post({ thread, text: "What is filling it?", request: "you-1" }, context));
  const third = valueOf(await scoutsChat.post({ thread, text: "Old logs in /var/log.", request: "scout-3" }, context));
  await until(() => yours.messages.value.length === 4, "the four messages to arrive");
  assert.equal(yours.unread.value, 3, "scout's three are new to you, and yours is not");
  await until(() => channel.unread.value?.[thread] === 3, "the channel to count them in the thread");

  valueOf(await yourChat.markRead({ message: second.id }, context));
  await until(() => yours.unread.value === 1, "only what scout wrote after the mark to be new");
  valueOf(await yourChat.markRead({ message: first.id }, context));
  // The thread is read again at each change, so once it shows a later message it shows the mark as it stood then.
  const fourth = valueOf(await scoutsChat.post({ thread, text: "And the package cache.", request: "scout-4" }, context));
  await until(() => yours.messages.value.length === 5, "scout's fourth to arrive");
  assert.equal(yours.unread.value, 2, "a mark never moves back");

  valueOf(await yourChat.markRead({ message: fourth.id }, context));
  await until(() => channel.unread.value?.[thread] === 0, "nothing to be new once the mark is at the newest");
  valueOf(await yourChat.post({ thread, text: "I'll clear them.", request: "you-2" }, context));
  await until(() => yours.messages.value.length === 6, "your message to arrive");
  assert.equal(yours.unread.value, 0, "your own message is never new to you");

  // A side thread counts on its own.
  const side = valueOf(await yourChat.createThread({ channel: dm.id, name: "backups" }, context));
  valueOf(await scoutsChat.post({ thread: side.id, text: "Backups are fine.", request: "scout-5" }, context));
  await until(() => channel.unread.value?.[side.id] === 1, "the side thread's message to be new");
  assert.equal(channel.unread.value[thread], 0);

  // An agent keeps no marks.
  assert.equal(scouts.unread.value, null);
  assert.equal((await scout.host.get(Channel, { channel: dm.id }, context)).unread.value, null);
  refusalOf(await scoutsChat.markRead({ message: third.id }, context));
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

  const onTerminal = await terminal.host.get(Chat, {}, context);
  const dm = valueOf(await onTerminal.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await onTerminal.createThread({ channel: dm.id, name: null }, context)).id;
  const said = valueOf(await (await scout.host.get(Chat, {}, context)).post({ thread, text: "Done.", request: "scout-1" }, context));
  const onPhone = await phone.host.get(Thread, { thread }, context);
  const phoneChannel = await phone.host.get(Channel, { channel: dm.id }, context);
  await until(() => onPhone.unread.value === 1 && phoneChannel.unread.value?.[thread] === 1, "scout's message to be new on the phone");

  valueOf(await onTerminal.markRead({ message: said.id }, context));

  await until(() => onPhone.unread.value === 0, "the phone's thread to follow the mark the terminal moved");
  await until(() => phoneChannel.unread.value?.[thread] === 0, "and its channel");
});
