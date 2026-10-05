import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ServerError } from "@earendil-works/pi-client";
import { startChatRig } from "./testing/index.ts";

const timeout = 15_000;
const never = new AbortController().signal;

test("a reply is posted once however delivery goes wrong: a post that fails, one whose answer is lost, and receipts that fail", { timeout }, async (t) => {
  const rig = await startChatRig(t);
  const said = await rig.say("hello");
  rig.faults.fail("post", new Error("overloaded"));
  rig.faults.loseAnswerToNextPost();
  rig.faults.fail("leaveReceipt", new Error("chat hiccuped"), 2);

  await rig.delivery.tell(rig.outstanding(said), { kind: "answered", answer: "1", text: "Only once." }, never);

  const receipt = await rig.receiptOn(said);
  const replies = await rig.replies();
  assert.deepEqual(replies.map((reply) => reply.text), ["Only once."]);
  assert.deepEqual([receipt.status, receipt.reply], ["answered", replies[0]?.id]);
  assert.deepEqual(
    rig.errors.map((error) => error.message),
    ["overloaded", "chat hiccuped", "chat hiccuped"],
    "each failure was reported, and a lost connection is not one",
  );
});

test("a reply that chat refuses for good is dropped with a report", { timeout }, async (t) => {
  const rig = await startChatRig(t);
  const said = await rig.say("hello");
  rig.faults.fail("post", new ServerError({ code: "service_invalid_value", message: "Unknown thread: th_gone" }), 10);

  await rig.delivery.tell(rig.outstanding(said), { kind: "answered", answer: "1", text: "Too late." }, never);

  assert.deepEqual(await rig.replies(), []);
  assert.equal(rig.errors.length, 1);
  assert.ok(rig.errors[0]?.message.includes(said.event) && rig.errors[0].message.includes("Unknown thread: th_gone"));
  assert.equal(rig.faults.calls("post"), 1, "and it was not asked again");
});

test("a reply waits for chat to come back, and the agent leaving chat first does not end it", { timeout }, async (t) => {
  const rig = await startChatRig(t);
  const said = await rig.say("hello");
  await rig.chat.outage();
  const engine = new AbortController();

  const told = rig.delivery.tell(rig.outstanding(said), { kind: "answered", answer: "1", text: "Late." }, engine.signal);
  const settled = told.then(
    () => "told",
    () => "failed",
  );
  await delay(100);
  rig.delivery.close();
  await delay(100);

  assert.equal(await Promise.race([settled, delay(50, "waiting")]), "waiting", "a rejection now would end its task for good");
  engine.abort(new Error("The engine is closing."));
  assert.equal(await settled, "failed", "the engine closing is the only thing that ends it");
});
