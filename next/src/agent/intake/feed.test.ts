import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember, type Message, personMember } from "../../contracts/chat/index.ts";
import { scriptedChat } from "../../contracts/chat/testing/index.ts";
import { eventually, settle, until } from "../../lib/testing/index.ts";
import { wakes } from "./feed.ts";
import { scout, scriptedTurns, startIntakeRig, zach } from "./testing/index.ts";

const timeout = 15_000;

function message(overrides: Partial<Message>): Message {
  return {
    id: "msg_1",
    seq: 1,
    channelId: "ch_1",
    threadId: "th_1",
    author: zach,
    text: "hello",
    sentAt: 0,
    addressed: ["agent:scout"],
    receipts: [],
    ...overrides,
  };
}

test("a message addressed to the agent wakes it, from a person or another agent", () => {
  assert.equal(wakes(scout, message({})), true);
  assert.equal(wakes(scout, message({ author: agentMember("helper") })), true);
});

test("a message that already carries the agent's receipt is passed over, whatever the receipt says", () => {
  const receipt = { memberId: "agent:scout", status: "skipped" as const, reply: null, detail: null };

  assert.equal(wakes(scout, message({ receipts: [receipt] })), false);
  assert.equal(wakes(scout, message({ receipts: [{ ...receipt, memberId: "agent:other" }] })), true);
});

test("anything else is left alone: the agent's own messages, and messages meant for someone else", () => {
  assert.equal(wakes(scout, message({ author: scout, addressed: ["person:zach"] })), false);
  assert.equal(wakes(scout, message({ author: scout, addressed: ["agent:scout"] })), false);
  assert.equal(wakes(scout, message({ addressed: [] })), false);
  assert.equal(wakes(scout, message({ addressed: ["person:alice", "agent:other"] })), false);
});

test("a message in a DM is handed to its session as its text under a line that says who wrote it and when", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);

  const said = rig.say("Is the build green?");

  await until(() => rig.turns.handed.has(said.id), "the message to be handed over");
  const when = new Date(said.sentAt).toISOString().replace(/\.\d{3}Z$/, "Z");
  assert.equal(rig.turns.handed.get(said.id), `Zach wrote at ${when}:\nIs the build green?`);
});

test("the agent's own reply comes back in its feed and is not a message to answer", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = rig.say("hello");
  await until(() => rig.turns.handed.has(said.id), "the message to be handed over");

  rig.turns.end({ kind: "answered", answer: "1", text: "Hi Zach." }, said.id);

  await until(() => rig.turns.settled.length === 1, "the reply to be delivered");
  const reply = rig.said().at(-1);
  await eventually(() => rig.turns.cursor(), (cursor) => cursor === reply?.seq, { what: "the cursor to pass the reply" });
  assert.deepEqual(
    rig.turns.calls.filter((call) => call.startsWith("record")),
    [`record ${said.id}`],
  );
});

test("the cursor moves past each message that is taken, after it is handed over", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);

  const said = rig.say("hello");

  await eventually(() => rig.turns.cursor(), (cursor) => cursor === said.seq, { what: "the cursor to reach the message" });
  const order = rig.turns.calls.filter((call) => call.includes(said.id) || call === `setCursor ${String(said.seq)}`);
  assert.deepEqual(order, [`record ${said.id}`, `start ${said.id}`, `setCursor ${String(said.seq)}`]);
});

test("with no cursor the agent reads its channels from the start: what was said before it first connected is taken", { timeout }, async (t) => {
  const chat = scriptedChat();
  const { thread } = chat.dm(zach, scout);
  const before = chat.say(zach, thread.id, "said before the agent ever started");
  const turns = scriptedTurns();

  const rig = await startIntakeRig(t, { chat, turns });
  const after = rig.say("said after");

  await until(() => turns.handed.has(before.id) && turns.handed.has(after.id), "both messages to be handed over");
  await eventually(() => turns.cursor(), (cursor) => cursor === after.seq, { what: "the cursor to reach the newest message" });
});

test("a restarted agent catches up from its cursor: what it missed is taken once, and what it took is not taken again", { timeout }, async (t) => {
  const chat = scriptedChat();
  const turns = scriptedTurns();
  const first = await startIntakeRig(t, { chat, turns });
  const one = first.say("one");
  await until(() => turns.handed.has(one.id), "the first message to be handed over");
  await eventually(() => turns.cursor(), (cursor) => cursor === one.seq, { what: "the cursor to reach it" });
  await first.intake.close();
  await first.link.close();

  const missed = first.say("said while the agent was down");
  const second = await startIntakeRig(t, { chat, turns });

  await until(() => turns.handed.has(missed.id), "the missed message to be handed over");
  const taken = turns.calls.filter((call) => call.startsWith("record"));
  assert.deepEqual(taken, [`record ${one.id}`, `record ${missed.id}`]);
  assert.deepEqual(second.errors, []);
});

test("a cursor the chat server refuses as past its end makes the agent read the log from the start, with a report", { timeout }, async (t) => {
  const chat = scriptedChat();
  const { thread } = chat.dm(zach, scout);
  const old = chat.say(zach, thread.id, "already in the log");
  const turns = scriptedTurns();
  await turns.setCursor(old.seq + 40);

  const rig = await startIntakeRig(t, { chat, turns });
  const fresh = rig.say("said after the store was replaced");

  await until(() => turns.handed.has(old.id) && turns.handed.has(fresh.id), "both messages to be handed over");
  assert.equal(rig.errors.length, 1);
  assert.match(
    rig.errors[0]?.message ?? "",
    new RegExp(`^Chat's log ends at ${String(old.seq)}, before the agent's place in it at ${String(old.seq + 40)}\\. .*reads the new log from the start`),
  );
});

test("a store that was replaced under a running agent is noticed the next time the agent reads", { timeout }, async (t) => {
  const chat = scriptedChat();
  const turns = scriptedTurns();
  const rig = await startIntakeRig(t, { chat, turns });
  const posts = [rig.say("one"), rig.say("two"), rig.say("three")];
  await eventually(() => turns.cursor(), (cursor) => cursor === posts[2]?.seq, { what: "the cursor to reach the third message" });

  chat.replace();
  const { thread } = chat.dm(zach, scout);
  chat.down();
  chat.up();
  await eventually(() => turns.cursor(), (cursor) => cursor === 0, { what: "the cursor to go back to the start of the new log" });
  const fresh = chat.say(zach, thread.id, "first message of the new store");

  await until(() => turns.handed.has(fresh.id), "the new message to be handed over");
  assert.equal(fresh.seq, 1);
  assert.equal(await turns.cursor(), 1);
  // The messages the agent was still working on belong to a thread the new log has never heard of, and it says so too.
  assert.ok(rig.errors.some((error) => /^Chat's log ends at 0, before the agent's place in it at 3\. /.test(error.message)));
});

test("a failure while a message is taken is reported, and the message is taken again after a pause", { timeout }, async (t) => {
  const turns = scriptedTurns();
  turns.fail("start", new Error("the disk is full"), 2);
  const rig = await startIntakeRig(t, { turns });

  const said = rig.say("hello");

  await until(() => turns.handed.has(said.id), "the message to be handed over");
  await eventually(() => turns.cursor(), (cursor) => cursor === said.seq, { what: "the cursor to move past it" });
  assert.deepEqual(
    rig.errors.map((error) => error.message),
    ["the disk is full", "the disk is full"],
  );
  assert.equal((await turns.outstanding()).length, 1, "recorded once, however often it was tried");
});

test("the feed carries on over a new connection after chat cuts the old one, without losing or repeating a message", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const one = rig.say("one");
  await until(() => rig.turns.handed.has(one.id), "the first message to be handed over");

  rig.chat.down();
  const two = rig.say("said while chat was unreachable");
  rig.chat.up();

  await until(() => rig.turns.handed.has(two.id), "the second message to be handed over");
  await settle();
  assert.deepEqual(
    rig.turns.calls.filter((call) => call.startsWith("record")),
    [`record ${one.id}`, `record ${two.id}`],
  );
  assert.deepEqual(rig.errors, []);
});

test("the agent does not read the feed once it has been told to stop taking messages", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const one = rig.say("one");
  await until(() => rig.turns.handed.has(one.id), "the first message to be handed over");

  rig.intake.stopTaking();
  const two = rig.say("two");
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(rig.turns.handed.has(two.id), false);
});

test("someone else in a DM does not wake an agent that is not in it", { timeout }, async (t) => {
  const chat = scriptedChat();
  const alice = personMember("alice");
  const bob = agentMember("bob");
  const { thread: other } = chat.dm(alice, bob);
  const rig = await startIntakeRig(t, { chat });

  chat.say(alice, other.id, "not for scout");
  const mine = rig.say("for scout");

  await until(() => rig.turns.handed.has(mine.id), "the message for scout to be handed over");
  assert.equal(rig.turns.handed.size, 1);
});
