import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, receiptWords, Thread } from "../contracts/chat/index.ts";
import { Roster } from "../contracts/gateway/index.ts";
import { startTestPushService, type TestBrowser } from "../contracts/gateway/testing/index.ts";
import { until } from "../lib/testing/index.ts";
import { startChatInProcess, valueOf } from "./testing/index.ts";

/*
 * The whole way a notification goes: the chat server raises it, hands it to the real gateway, a process of its own,
 * and the gateway sends it by Web Push to a push service the test stands in for, which takes only what a real one
 * would, for a browser the page's door let in and subscribed.
 */

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

/** How long a message waits unread before you are told of it, here. */
const WAIT_MS = 500;

/** You and scout in your DM, on a chat server whose gateway serves the page, with a phone of yours subscribed to push. */
async function withPhone(t: TestContext) {
  const chat = await startChatInProcess(t, { notifyAfterMs: WAIT_MS });
  const you = await chat.person();
  const roster = await you.host.get(Roster, {}, context);
  const page = chat.gateway.listening.page;
  assert.ok(page !== null, "the gateway serves the page");
  const push = await startTestPushService(t);
  const subscribe = async (label: string): Promise<TestBrowser> => push.subscribe(page, valueOf(await roster.inviteDevice(context)).code, label);
  const phone = await subscribe("phone");
  const scout = await chat.agent("scout");
  const dm = valueOf(await (await you.host.get(Chat, {}, context)).openDm({ member: scout.you.id }, context));
  const [main] = (await you.host.get(Channel, { channel: dm.id }, context)).threads.value;
  assert.ok(main);
  const yours = await you.host.get(Thread, { thread: main.id }, context);
  const scouts = await scout.host.get(Thread, { thread: main.id }, context);
  return { chat, you, roster, push, subscribe, phone, scout, main, yours, scouts };
}

test("a message left unread is told to your phone once, after a few seconds, and one you read in time is not", { timeout }, async (t) => {
  const { push, phone, main, yours, scouts } = await withPhone(t);

  valueOf(await scouts.post({ text: "\n  The disk is at 91%.  \nIt grows by a gigabyte a day.", request: "scout-1" }, context));
  const [told] = await phone.untilNotified(1);
  assert.deepEqual(told, { from: "scout", room: null, line: "The disk is at 91%.", thread: main.id, unread: 1 });

  const read = valueOf(await scouts.post({ text: "Old logs in /var/log.", request: "scout-2" }, context));
  valueOf(await yours.markRead({ message: read.id }, context));
  valueOf(await scouts.post({ text: "I cleared them.", request: "scout-3" }, context));

  const [, next] = await phone.untilNotified(2);
  assert.equal(next?.line, "I cleared them.", "what you read in time is told to nobody");
  assert.equal(next.unread, 1, "and isn't new to you");
  await delay(WAIT_MS * 2);
  assert.equal(phone.notifications().length, 2, "each message is told once");
  assert.deepEqual(push.refused(), []);
});

test("in a room you are in, you are told only of a message that names you", { timeout }, async (t) => {
  const { chat, you, phone, scout } = await withPhone(t);
  const bob = await chat.agent("bob");
  const room = valueOf(await (await you.host.get(Chat, {}, context)).createRoom({ name: "ops", members: [scout.you.id, bob.you.id] }, context));
  const [main] = (await you.host.get(Channel, { channel: room.id }, context)).threads.value;
  assert.ok(main && you.you);
  const scouts = await scout.host.get(Thread, { thread: main.id }, context);

  valueOf(await scouts.post({ text: "Deploying now.", request: "scout-1" }, context));
  valueOf(await scouts.post({ text: "@bob, can you watch the logs?", request: "scout-2" }, context));
  valueOf(await scouts.post({ text: `@${you.you.name} the deploy is stuck.`, request: "scout-3" }, context));

  const [told] = await phone.untilNotified(1);
  assert.deepEqual(told, { from: "scout", room: "ops", line: `@${you.you.name} the deploy is stuck.`, thread: main.id, unread: 3 });
  await delay(WAIT_MS * 2);
  assert.equal(phone.notifications().length, 1);
});

test("a receipt that says a message of yours failed is told to your phone", { timeout }, async (t) => {
  const { phone, scout, main, yours } = await withPhone(t);
  const asked = valueOf(await yours.post({ text: "How full is the disk?", request: "you-1" }, context));
  const receipt = { status: "failed", reply: null, detail: "The model is unreachable." } as const;

  valueOf(await (await scout.host.get(Chat, {}, context)).leaveReceipt({ events: [asked.event], receipt }, context));

  const [told] = await phone.untilNotified(1);
  const said = receiptWords({ memberId: scout.you.id, event: asked.event, ...receipt }, "scout");
  assert.deepEqual(told, { from: "scout", room: null, line: said, thread: main.id, unread: 0 });
});

test("where a device is told things, and the key the gateway signs with, outlast the gateway going away and coming back", { timeout }, async (t) => {
  const { chat, push, phone, scout, main } = await withPhone(t);

  await chat.gateway.outage();
  await chat.gateway.recover();

  const scouts = scout.host.hold(Thread, { thread: main.id }, context);
  await until(() => scouts.state.value.kind === "live", "scout's hold of the thread to bind once the gateway is back");
  valueOf(await scouts.post({ text: "Back again.", request: "scout-1" }, context));
  const [told] = await phone.untilNotified(1);
  assert.equal(told?.line, "Back again.");
  assert.deepEqual(push.refused(), [], "signed with the key the phone subscribed with");
});

test("the gateway tells each device that has a place, forgets one its push service says is gone, and tells a device taken back nothing", { timeout }, async (t) => {
  const { roster, push, subscribe, phone, scouts } = await withPhone(t);
  const laptop = await subscribe("laptop");
  const tablet = await subscribe("tablet");
  await until(() => roster.ways.value.some((way) => way.label === "tablet"), "you to see the tablet among your devices");
  const way = roster.ways.value.find((each) => each.label === "tablet");
  assert.ok(way);
  valueOf(await roster.takeBack({ way: way.id }, context));
  laptop.unsubscribe();

  valueOf(await scouts.post({ text: "First.", request: "scout-1" }, context));
  await phone.untilNotified(1);
  await until(() => laptop.attempts() === 1, "the laptop's push service to be asked");
  valueOf(await scouts.post({ text: "Second.", request: "scout-2" }, context));
  await phone.untilNotified(2);

  assert.equal(laptop.attempts(), 1, "a place that is gone is forgotten");
  assert.deepEqual(laptop.notifications(), []);
  assert.equal(tablet.attempts(), 0, "a device taken back is told nothing");
  assert.deepEqual(push.refused(), []);
});
