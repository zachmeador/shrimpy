import assert from "node:assert/strict";
import { test } from "node:test";
import { scriptedChat } from "../../contracts/chat/testing/index.ts";
import type { Message, Receipt } from "../../contracts/chat/index.ts";
import { Refusal } from "../../lib/refusal/index.ts";
import { eventually, until } from "../../lib/testing/index.ts";
import { snapshotOf } from "./prompt.ts";
import { type IntakeRig, scout, scriptedTurns, startIntakeRig, zach } from "./testing/index.ts";

const timeout = 15_000;

/** Say something and wait until it has been handed to its session. */
async function sayAndWait(rig: IntakeRig, text: string): Promise<Message> {
  const said = rig.say(text);
  await until(() => rig.turns.handed.has(said.id), `"${text}" to be handed over`);
  return said;
}

/** What the agent has posted in the thread, oldest first. */
const posted = (rig: IntakeRig): Message[] => rig.said().filter((message) => message.author.id === scout.id);

/** The receipt the agent left on a message, once it has. */
async function receiptOn(rig: IntakeRig, message: Message): Promise<Receipt> {
  return eventually(
    () => rig.said().find((candidate) => candidate.id === message.id)?.receipts[0],
    (receipt) => receipt !== undefined,
    { what: `the receipt on "${message.text}"` },
  ) as Promise<Receipt>;
}

test("the step order of a message is the plan's: recorded, handed over, then the cursor moves, then the reply, the receipt and the settling", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.turns.end({ kind: "answered", answer: "1", text: "Hi." }, said.id);
  await receiptOn(rig, said);
  await until(() => rig.turns.settled.length === 1, "the message to be settled");

  const mine = rig.turns.calls.filter((call) => call.includes(said.id) || call === `setCursor ${String(said.seq)}`);
  assert.deepEqual(mine, [`record ${said.id}`, `start ${said.id}`, `setCursor ${String(said.seq)}`, `settle ${said.id}`]);
});

test("a connection lost while the reply is being posted does not post it twice", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  const held = rig.chat.hold("post");

  rig.turns.end({ kind: "answered", answer: "1", text: "Only once." }, said.id);
  await eventually(() => held.arrived(), (arrived) => arrived === 1, { what: "the post to arrive" });
  rig.chat.down();
  rig.chat.up();
  await eventually(() => held.arrived(), (arrived) => arrived === 2, { what: "the post to be tried again" });
  held.release();

  await receiptOn(rig, said);
  assert.deepEqual(
    posted(rig).map((reply) => reply.text),
    ["Only once."],
  );
});

test("a receipt that fails is tried again without posting the reply a second time", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.chat.fail("leaveReceipt", new Error("chat hiccuped"), 2);

  rig.turns.end({ kind: "answered", answer: "1", text: "Once is enough." }, said.id);

  await receiptOn(rig, said);
  assert.equal(posted(rig).length, 1);
  assert.equal(rig.chat.calls("post"), 3, "the reply was asked for each time, and posted once");
  assert.deepEqual(
    rig.errors.map((error) => error.message),
    ["chat hiccuped", "chat hiccuped"],
  );
});

test("a failure that is not a refusal is tried again until it works", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.chat.fail("post", new Error("overloaded"), 3);

  rig.turns.end({ kind: "answered", answer: "1", text: "Got there." }, said.id);

  await receiptOn(rig, said);
  assert.deepEqual(
    posted(rig).map((reply) => reply.text),
    ["Got there."],
  );
  assert.equal(rig.errors.length, 3);
});

test("a reply that chat refuses for good is dropped with a report, and the message is settled", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.chat.fail("post", new Refusal("Unknown thread: th_gone"), 10);

  rig.turns.end({ kind: "answered", answer: "1", text: "Too late." }, said.id);

  await until(() => rig.turns.settled.length === 1, "the message to be settled");
  assert.deepEqual(posted(rig), []);
  assert.equal(rig.errors.length, 1);
  assert.equal(
    rig.errors[0]?.message,
    `Chat refused what the agent had to say about ${said.id}, so it was dropped: Unknown thread: th_gone`,
  );
  assert.equal(rig.chat.calls("post"), 1, "and it was not asked again");
});

test("a restarted agent finds a message that was recorded but never handed over, and hands it over", { timeout }, async (t) => {
  const chat = scriptedChat();
  const { thread } = chat.dm(zach, scout);
  const turns = scriptedTurns();
  const said = chat.say(zach, thread.id, "recorded, then the agent died");
  await turns.setCursor(said.seq - 1);
  await turns.record({
    message: snapshotOf(said),
    threadId: thread.id,
    channelId: said.channelId,
  });

  const rig = await startIntakeRig(t, { chat, turns });

  await until(() => rig.turns.handed.has(said.id), "the message to be handed over");
  assert.deepEqual(
    rig.turns.calls.filter((call) => call.startsWith("start")),
    [`start ${said.id}`],
    "once, though both the outbox and the feed brought it up",
  );
});
