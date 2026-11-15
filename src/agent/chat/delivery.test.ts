import assert from "node:assert/strict";
import { test } from "node:test";
import { Refusal } from "../../lib/refusal/index.ts";
import { until } from "../../lib/testing/index.ts";
import { startChatRig } from "./testing/index.ts";

const timeout = 15_000;
const never = new AbortController().signal;

test("a reply is posted once however delivery goes wrong", { timeout }, async (t) => {
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
    ["overloaded", "The answer to the post was lost.", "chat hiccuped", "chat hiccuped"],
    "each failure was reported",
  );
});

test("a reply that chat refuses for good is not posted again, and the event gets a failed receipt", { timeout }, async (t) => {
  const rig = await startChatRig(t);
  const said = await rig.say("hello");
  rig.faults.fail("post", new Refusal("Unknown thread: th_gone"), 10);

  await rig.delivery.tell(rig.outstanding(said), { kind: "answered", answer: "1", text: "Too late." }, never);

  assert.deepEqual(await rig.replies(), []);
  const receipt = await rig.receiptOn(said);
  assert.deepEqual([receipt.status, receipt.reply], ["failed", null]);
  assert.ok(receipt.detail?.includes("th_gone"), String(receipt.detail));
  assert.equal(rig.errors.length, 1);
  assert.ok(rig.errors[0]?.message.includes(said.event) && rig.errors[0].message.includes("th_gone"));
  assert.equal(rig.faults.calls("post"), 1, "and it was not asked again");
});

test("a reply waits for chat to come back, and the agent leaving chat first does not end it", { timeout }, async (t) => {
  const rig = await startChatRig(t);
  const said = await rig.say("hello");
  await rig.chat.outage();
  const engine = new AbortController();

  const told = rig.delivery.tell(rig.outstanding(said), { kind: "answered", answer: "1", text: "Late." }, engine.signal);
  let ended: string | undefined;
  const settled = told.then(
    () => (ended = "told"),
    () => (ended = "failed"),
  );
  rig.delivery.close();
  // Chat comes back and the agent's way to it is up again, long after anything the leaving would have ended.
  await rig.chat.recover();
  await until(() => rig.link.current() !== undefined, "the agent's way to chat to be up again");

  assert.equal(ended, undefined, "a rejection now would end its task for good");
  engine.abort(new Error("The engine is closing."));
  assert.equal(await settled, "failed", "the engine closing is the only thing that ends it");
});
