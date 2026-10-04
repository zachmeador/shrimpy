import assert from "node:assert/strict";
import { test } from "node:test";
import { ServerError } from "@earendil-works/pi-client";
import type { Message } from "../../contracts/chat/index.ts";
import { joinRoster } from "../../contracts/chat/testing/index.ts";
import { until } from "../../lib/testing/index.ts";
import { SCOUT, startChatServer, talkTo } from "../testing/index.ts";
import { type IntakeRig, scriptedTurns, startIntakeRig } from "./testing/index.ts";

const timeout = 15_000;

/** Say something and wait until its post has been handed to a session. */
async function sayAndWait(rig: IntakeRig, text: string): Promise<Message> {
  const said = await rig.say(text);
  await until(() => rig.turns.handed.has(said.event), `"${text}" to be handed over`);
  return said;
}

test("the step order of an event is the plan's: recorded, handed over, then the cursor moves, then the reply, the receipt and the settling", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.turns.end({ kind: "answered", answer: "1", text: "Hi." }, said.event);
  await rig.receiptOn(said);
  await until(() => rig.turns.settled.length === 1, "the event to be settled");

  const mine = rig.turns.calls.filter((call) => call.includes(said.event) || call === `setCursor ${String(said.seq)}`);
  assert.deepEqual(mine, [`record ${said.event}`, `start ${said.event}`, `setCursor ${String(said.seq)}`, `settle ${said.event}`]);
});

test("a reply is posted once however delivery goes wrong: a post that fails, one whose answer is lost, and receipts that fail", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.faults.fail("post", new Error("overloaded"));
  rig.faults.loseAnswerToNextPost();
  rig.faults.fail("leaveReceipt", new Error("chat hiccuped"), 2);

  rig.turns.end({ kind: "answered", answer: "1", text: "Only once." }, said.event);

  const receipt = await rig.receiptOn(said);
  const replies = await rig.replies();
  assert.deepEqual(replies.map((reply) => reply.text), ["Only once."]);
  assert.deepEqual([receipt.status, receipt.reply], ["answered", replies[0]?.id]);
  assert.deepEqual(
    rig.errors.map((error) => error.message),
    ["overloaded", "chat hiccuped", "chat hiccuped"],
    "each failure was reported, and a lost connection is not one",
  );
  await until(() => rig.turns.settled.length === 1, "the event to be settled");
});

test("a reply that chat refuses for good is dropped with a report, and the event is settled", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.faults.fail("post", new ServerError({ code: "service_invalid_value", message: "Unknown thread: th_gone" }), 10);

  rig.turns.end({ kind: "answered", answer: "1", text: "Too late." }, said.event);

  await until(() => rig.turns.settled.length === 1, "the event to be settled");
  assert.deepEqual(await rig.replies(), []);
  assert.equal(rig.errors.length, 1);
  assert.ok(rig.errors[0]?.message.includes(said.event) && rig.errors[0].message.includes("Unknown thread: th_gone"));
  assert.equal(rig.faults.calls("post"), 1, "and it was not asked again");
});

test("a restarted agent finds an event that was recorded but never handed over, and hands it over", { timeout }, async (t) => {
  const chat = await startChatServer(t);
  // The agent has joined the roster, and is not running yet.
  await joinRoster(t, SCOUT);
  const person = await talkTo(chat);
  const turns = scriptedTurns();
  const said = await person.say("recorded, then the agent died");
  await turns.setCursor(said.seq - 1);
  await turns.record({
    event: { kind: "posted", id: said.event, seq: said.seq, author: said.author.name, sentAt: said.sentAt, text: said.text },
    threadId: said.threadId,
    channelId: said.channelId,
  });

  const rig = await startIntakeRig(t, { chat, turns });

  await until(() => rig.turns.handed.has(said.event), "the event to be handed over");
  assert.deepEqual(
    rig.turns.calls.filter((call) => call.startsWith("start")),
    [`start ${said.event}`],
    "once, though both the outbox and the feed brought it up",
  );
});
