import assert from "node:assert/strict";
import { test } from "node:test";
import { ServerError } from "@earendil-works/pi-client";
import type { Message } from "../../contracts/chat/index.ts";
import { joinRoster } from "../../contracts/chat/testing/index.ts";
import { until } from "../../lib/testing/index.ts";
import { SCOUT, startChatServer, talkTo } from "../testing/index.ts";
import { snapshotOf } from "./prompt.ts";
import { type IntakeRig, scriptedTurns, startIntakeRig } from "./testing/index.ts";

const timeout = 15_000;

/** Say something and wait until it has been handed to its session. */
async function sayAndWait(rig: IntakeRig, text: string): Promise<Message> {
  const said = await rig.say(text);
  await until(() => rig.turns.handed.has(said.id), `"${text}" to be handed over`);
  return said;
}

test("the step order of a message is the plan's: recorded, handed over, then the cursor moves, then the reply, the receipt and the settling", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.turns.end({ kind: "answered", answer: "1", text: "Hi." }, said.id);
  await rig.receiptOn(said);
  await until(() => rig.turns.settled.length === 1, "the message to be settled");

  const mine = rig.turns.calls.filter((call) => call.includes(said.id) || call === `setCursor ${String(said.seq)}`);
  assert.deepEqual(mine, [`record ${said.id}`, `start ${said.id}`, `setCursor ${String(said.seq)}`, `settle ${said.id}`]);
});

test("a reply is posted once however delivery goes wrong: a post that fails, one whose answer is lost, and receipts that fail", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.faults.fail("post", new Error("overloaded"));
  rig.faults.loseAnswerToNextPost();
  rig.faults.fail("leaveReceipt", new Error("chat hiccuped"), 2);

  rig.turns.end({ kind: "answered", answer: "1", text: "Only once." }, said.id);

  const receipt = await rig.receiptOn(said);
  const replies = await rig.replies();
  assert.deepEqual(replies.map((reply) => reply.text), ["Only once."]);
  assert.deepEqual([receipt.status, receipt.reply], ["answered", replies[0]?.id]);
  assert.deepEqual(
    rig.errors.map((error) => error.message),
    ["overloaded", "chat hiccuped", "chat hiccuped"],
    "each failure was reported, and a lost connection is not one",
  );
  await until(() => rig.turns.settled.length === 1, "the message to be settled");
});

test("a reply that chat refuses for good is dropped with a report, and the message is settled", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.faults.fail("post", new ServerError({ code: "service_invalid_value", message: "Unknown thread: th_gone" }), 10);

  rig.turns.end({ kind: "answered", answer: "1", text: "Too late." }, said.id);

  await until(() => rig.turns.settled.length === 1, "the message to be settled");
  assert.deepEqual(await rig.replies(), []);
  assert.equal(rig.errors.length, 1);
  assert.ok(rig.errors[0]?.message.includes(said.id) && rig.errors[0].message.includes("Unknown thread: th_gone"));
  assert.equal(rig.faults.calls("post"), 1, "and it was not asked again");
});

test("a restarted agent finds a message that was recorded but never handed over, and hands it over", { timeout }, async (t) => {
  const chat = await startChatServer(t);
  // The agent has joined the roster, and is not running yet.
  await joinRoster(t, SCOUT);
  const person = await talkTo(chat);
  const turns = scriptedTurns();
  const said = await person.say("recorded, then the agent died");
  await turns.setCursor(said.seq - 1);
  await turns.record({ message: snapshotOf(said), threadId: said.threadId, channelId: said.channelId });

  const rig = await startIntakeRig(t, { chat, turns });

  await until(() => rig.turns.handed.has(said.id), "the message to be handed over");
  assert.deepEqual(
    rig.turns.calls.filter((call) => call.startsWith("start")),
    [`start ${said.id}`],
    "once, though both the outbox and the feed brought it up",
  );
});
