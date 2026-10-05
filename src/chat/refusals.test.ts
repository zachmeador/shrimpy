import assert from "node:assert/strict";
import { test } from "node:test";
import { follow, mainThread, outcome, startTestChat } from "./testing/index.ts";

const timeout = 30_000;

test("before a connection has come in with a ticket, every call but enter is refused, and a ticket works once", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  // Once someone has come in, the chat server is registered and can ask the gateway.
  await chat.person();
  const stranger = await chat.connect();
  const calls: [string, () => Promise<unknown>][] = [
    ["channels", () => stranger.chat.channels()],
    ["openDm", () => stranger.chat.openDm("mem_1")],
    ["createRoom", () => stranger.chat.createRoom("Ops", [])],
    ["addMembers", () => stranger.chat.addMembers("ch_1", ["mem_1"])],
    ["threads", () => stranger.chat.threads("ch_1")],
    ["createThread", () => stranger.chat.createThread("ch_1", null)],
    ["renameThread", () => stranger.chat.renameThread("th_1", "Name")],
    ["archiveThread", () => stranger.chat.archiveThread("th_1", true)],
    ["post", () => stranger.chat.post("th_1", "hello", "request-1")],
    ["edit", () => stranger.chat.edit("msg_1", "hello")],
    ["delete", () => stranger.chat.delete("msg_1")],
    ["react", () => stranger.chat.react("msg_1", "\u{1F44D}")],
    ["unreact", () => stranger.chat.unreact("msg_1", "\u{1F44D}")],
    ["read", () => stranger.chat.read("th_1", null, 10)],
    ["leaveReceipt", () => stranger.chat.leaveReceipt(["evt_1"], outcome("silent"))],
    ["setWorking", () => stranger.chat.setWorking("th_1", true)],
    ["head", () => stranger.chat.head()],
    ["feed", () => stranger.chat.feed(0, 10)],
    ["attach", () => stranger.attach("th_1")],
  ];

  for (const [name, call] of calls) {
    await assert.rejects(call(), { code: "service_not_allowed", message: /Come in with a ticket/ }, name);
  }
  await assert.rejects(stranger.chat.enter(""), { message: /^ticket must be an ID/ });
  await assert.rejects(stranger.chat.enter("made-up"), { message: /not good/ });

  const ticket = await chat.ticket();
  const me = await stranger.chat.enter(ticket);
  assert.equal(me.kind, "person");
  assert.deepEqual(await stranger.chat.channels(), []);
  await assert.rejects(stranger.chat.enter(await chat.ticket()), { message: /entered already/ });
  const another = await chat.connect();
  await assert.rejects(another.chat.enter(ticket), { message: /not good/ });
});

test("a member who is not in a channel cannot see or touch it", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const shrimpy = await chat.agent("Shrimpy");
  const alice = await chat.agent("Alice");
  const dm = await zach.chat.openDm(shrimpy.me.id);
  const main = await mainThread(zach, dm.id);
  const said = await zach.chat.post(main.id, "for shrimpy only", "zach-1");

  assert.deepEqual(await alice.chat.channels(), []);
  const refusals: [string, () => Promise<unknown>, RegExp][] = [
    ["threads", () => alice.chat.threads(dm.id), /^Unknown channel: ch_/],
    ["createThread", () => alice.chat.createThread(dm.id, "mine"), /^Unknown channel: ch_/],
    ["renameThread", () => alice.chat.renameThread(main.id, "mine"), /^Unknown thread: th_/],
    ["archiveThread", () => alice.chat.archiveThread(main.id, true), /^Unknown thread: th_/],
    ["post", () => alice.chat.post(main.id, "let me in", "alice-1"), /^Unknown thread: th_/],
    ["read", () => alice.chat.read(main.id, null, 10), /^Unknown thread: th_/],
    ["setWorking", () => alice.chat.setWorking(main.id, true), /^Unknown thread: th_/],
    ["attach", () => alice.attach(main.id), /^Unknown thread: th_/],
    ["leaveReceipt by a person", () => zach.chat.leaveReceipt([said.event], outcome("silent")), /^Only an agent/],
    [
      "leaveReceipt by another agent",
      () => alice.chat.leaveReceipt([said.event], outcome("silent")),
      /^Unknown event: evt_/,
    ],
  ];
  for (const [name, call, reason] of refusals) {
    await assert.rejects(call(), { code: "service_invalid_value", message: reason }, name);
  }

  const offered = follow(alice.chat.feed(0, 10));
  // The first call can be read in the same turn as the feed and answered ahead of it, so a second follows:
  // it is read in a later turn, and an answer to the feed would already be ahead of it.
  await alice.chat.head();
  await alice.chat.head();
  assert.equal(offered.done, false);
  assert.deepEqual((await shrimpy.chat.read(main.id, null, 10)).map((message) => message.text), ["for shrimpy only"]);
  assert.deepEqual((await zach.chat.threads(dm.id))[0]?.preview, "for shrimpy only");
});

test("a member who comes in again under a new name is the same member, with its channels, under that name", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const shrimpy = await chat.agent("Shrimpy");
  const dm = await zach.chat.openDm(shrimpy.me.id);
  const main = await mainThread(zach, dm.id);
  const said = await zach.chat.post(main.id, "Hello", "zach-1");
  assert.equal(dm.name, "Shrimpy");

  await chat.rename("Shrimpy", "Sparky");
  const renamed = await chat.agent("Sparky");

  assert.equal(renamed.me.id, shrimpy.me.id);
  assert.equal(renamed.me.name, "Sparky");
  const [channel] = await zach.chat.channels();
  assert.equal(channel?.id, dm.id);
  assert.equal(channel.name, "Sparky");
  assert.deepEqual(await renamed.chat.read(main.id, null, 10), [{ ...said, author: said.author }]);
  assert.equal((await zach.chat.openDm(renamed.me.id)).id, dm.id, "and it is the same DM that opens");
});

test("arguments of the wrong kind are refused with a reason", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const dm = await zach.chat.openDm((await chat.member("Shrimpy")).id);
  const main = await mainThread(zach, dm.id);
  const wrong = (value: unknown): never => value as never;

  const refusals: [() => Promise<unknown>, RegExp][] = [
    [() => zach.chat.openDm(zach.me.id), /needs someone besides yourself/],
    [() => zach.chat.openDm(wrong(7)), /^other must be an ID/],
    [() => zach.chat.post(main.id, "", "zach-1"), /needs some text/],
    [() => zach.chat.post(main.id, "hi", wrong("")), /^requestId must be an ID/],
    [() => zach.chat.read(main.id, null, 0), /^limit must be a whole number/],
    [() => zach.chat.react("msg_1", "thumbs up"), /^emoji must be one emoji/],
    [() => zach.chat.feed(99, 10), /past the newest event/],
  ];
  for (const [call, reason] of refusals) {
    await assert.rejects(call(), { code: "service_invalid_value", message: reason }, String(reason));
  }
});
