import assert from "node:assert/strict";
import { test } from "node:test";
import type { Member } from "../contracts/chat/index.ts";
import { agent, follow, mainThread, person, settle, startTestChat } from "./testing/index.ts";

const timeout = 30_000;

test("before a connection says who it is, every call but identify is refused", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const stranger = await chat.connect();
  const calls: [string, () => Promise<unknown>][] = [
    ["channels", () => stranger.chat.channels()],
    ["openDm", () => stranger.chat.openDm(agent("Shrimpy"))],
    ["threads", () => stranger.chat.threads("ch_1")],
    ["createThread", () => stranger.chat.createThread("ch_1", null)],
    ["renameThread", () => stranger.chat.renameThread("th_1", "Name")],
    ["archiveThread", () => stranger.chat.archiveThread("th_1", true)],
    ["post", () => stranger.chat.post("th_1", "hello", "request-1")],
    ["read", () => stranger.chat.read("th_1", null, 10)],
    ["markSkipped", () => stranger.chat.markSkipped(["msg_1"])],
    ["setWorking", () => stranger.chat.setWorking("th_1", true)],
    ["head", () => stranger.chat.head()],
    ["feed", () => stranger.chat.feed(0, 10)],
    ["attach", () => stranger.attach("th_1")],
  ];

  for (const [name, call] of calls) {
    await assert.rejects(call(), { code: "service_not_allowed", message: /Say who you are with identify/ }, name);
  }

  await stranger.chat.identify(person("Zach"));
  assert.deepEqual(await stranger.chat.channels(), []);
});

test("a member who is not in a channel cannot see or touch it", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const shrimpy = await chat.join(agent("Shrimpy"));
  const alice = await chat.join(person("Alice"));
  const outsider = await chat.join(agent("Outsider"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
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
    ["markSkipped by a person", () => alice.chat.markSkipped([said.id]), /^Only an agent/],
    ["markSkipped by another agent", () => outsider.chat.markSkipped([said.id]), /^Unknown message: msg_/],
  ];
  for (const [name, call, reason] of refusals) {
    await assert.rejects(call(), { code: "service_invalid_value", message: reason }, name);
  }

  const offered = follow(alice.chat.feed(0, 10));
  await settle();
  assert.equal(offered.done, false);
  assert.deepEqual((await shrimpy.chat.read(main.id, null, 10)).map((message) => message.text), ["for shrimpy only"]);
  assert.deepEqual((await zach.chat.threads(dm.id))[0]?.preview, "for shrimpy only");
});

test("a channel that does not exist is refused the same way as one the caller cannot see", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));

  await assert.rejects(zach.chat.threads("ch_nothing"), { message: "Unknown channel: ch_nothing" });
  await assert.rejects(zach.chat.read("th_nothing", null, 10), { message: "Unknown thread: th_nothing" });
  await assert.rejects(zach.chat.markSkipped(["msg_nothing"]), { message: /Only an agent/ });
});

test("a connection is one member for as long as it lasts", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));

  await zach.chat.identify({ id: "person:zach", kind: "person", name: "Zachariah" });
  await assert.rejects(zach.chat.identify(person("Someone")), {
    code: "service_invalid_value",
    message: /already identified as person:zach/,
  });

  const dm = await zach.chat.openDm(agent("Shrimpy"));
  assert.deepEqual(
    dm.members.map((member) => member.name),
    ["Shrimpy", "Zachariah"],
  );
});

test("a member cannot change what kind of member it is", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  await chat.join(agent("Shrimpy"));
  const impostor = await chat.connect();

  await assert.rejects(impostor.chat.identify({ id: "agent:shrimpy", kind: "person", name: "Shrimpy" }), {
    message: /agent:shrimpy is on record with kind agent, not person/,
  });
  await assert.rejects(impostor.chat.channels(), { code: "service_not_allowed" });
});

test("arguments of the wrong kind are refused with a reason", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  const wrong = (value: unknown): never => value as never;

  const refusals: [() => Promise<unknown>, RegExp][] = [
    [() => zach.chat.identify(wrong("person:zach") as Member), /^member must be a member/],
    [() => zach.chat.openDm(wrong({ id: "agent:x", kind: "robot", name: "X" })), /^other.kind must be/],
    [() => zach.chat.openDm(person("Zach")), /needs someone besides yourself/],
    [() => zach.chat.threads(wrong(7)), /^channelId must be an ID/],
    [() => zach.chat.createThread(dm.id, wrong("")), /^name must be/],
    [() => zach.chat.archiveThread(main.id, wrong("yes")), /^archived must be true or false/],
    [() => zach.chat.post(main.id, "", "zach-1"), /needs some text/],
    [() => zach.chat.post(main.id, "hi", wrong("")), /^requestId must be an ID/],
    [() => zach.chat.read(main.id, wrong("5"), 10), /^beforeSeq must be a whole number/],
    [() => zach.chat.read(main.id, null, 0), /^limit must be a whole number/],
    [() => zach.chat.feed(-1, 10), /^cursor must be a whole number/],
    [() => zach.chat.feed(99, 10), /past the newest message/],
  ];
  for (const [call, reason] of refusals) {
    await assert.rejects(call(), { code: "service_invalid_value", message: reason }, String(reason));
  }
});
