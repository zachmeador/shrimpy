import assert from "node:assert/strict";
import { test } from "node:test";
import { Refusal } from "../../lib/refusal/index.ts";
import { until } from "../../lib/testing/index.ts";
import { startChatRig } from "./testing/index.ts";

const timeout = 15_000;
const never = new AbortController().signal;

test("a reply is posted once however often telling goes wrong and is tried again", { timeout }, async (t) => {
  const rig = await startChatRig(t);
  const said = await rig.say("hello");
  rig.faults.fail("post", new Error("overloaded"));
  rig.faults.loseAnswerToNextPost();
  rig.faults.fail("leaveReceipt", new Error("chat hiccuped"), 2);

  // As the task that follows the input tries again after each pause, until it is told.
  const tell = () => rig.delivery.tell(rig.outstanding(said), { kind: "answered", answer: "1", text: "Only once." }, never);
  while ((await tell()) === "later") continue;

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

  assert.equal(await rig.delivery.tell(rig.outstanding(said), { kind: "answered", answer: "1", text: "Too late." }, never), "told");

  assert.deepEqual(await rig.replies(), []);
  const receipt = await rig.receiptOn(said);
  assert.deepEqual([receipt.status, receipt.reply], ["failed", null]);
  assert.ok(receipt.detail?.includes("th_gone"), String(receipt.detail));
  assert.equal(rig.errors.length, 1);
  assert.ok(rig.errors[0]?.message.includes(said.event) && rig.errors[0].message.includes("th_gone"));
  assert.equal(rig.faults.calls("post"), 1, "and it was not asked again");
});

test("while chat is away, and once the agent has left chat, a reply waits for a later try", { timeout }, async (t) => {
  const rig = await startChatRig(t);
  const said = await rig.say("hello");
  const answer = { kind: "answered", answer: "1", text: "Late." } as const;
  await rig.chat.outage();
  await until(() => rig.link.current() === undefined, "the agent's way to chat to be down");

  assert.equal(await rig.delivery.tell(rig.outstanding(said), answer, never), "later");
  rig.delivery.close();
  await rig.chat.recover();
  await until(() => rig.link.current() !== undefined, "the agent's way to chat to be up again");

  assert.equal(await rig.delivery.tell(rig.outstanding(said), answer, never), "later", "the reply waits for the agent's next start");
  assert.deepEqual(await rig.replies(), []);
});
