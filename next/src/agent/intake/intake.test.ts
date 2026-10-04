import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Message, Receipt } from "../../contracts/chat/index.ts";
import { MAX_RECEIPT_DETAIL_LENGTH } from "../../contracts/chat/index.ts";
import { scriptedChat } from "../../contracts/chat/testing/index.ts";
import { Refusal } from "../../lib/refusal/index.ts";
import { eventually, settle, until } from "../../lib/testing/index.ts";
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

test("a message is answered: the final text is posted in the thread, and the receipt points at it", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "Is the build green?");

  rig.turns.end({ kind: "answered", answer: "41", text: "Yes, it is green." }, said.id);

  const receipt = await receiptOn(rig, said);
  const [reply] = posted(rig);
  assert.equal(reply?.text, "Yes, it is green.");
  assert.deepEqual(receipt, { memberId: "agent:scout", status: "answered", reply: reply.id, detail: null });
  assert.deepEqual(rig.turns.settled, [{ messageId: said.id, outcome: { kind: "answered", answer: "41", text: "Yes, it is green." } }]);
  assert.deepEqual(rig.errors, []);
});

test("the step order of a message is the plan's: recorded, handed over, then the cursor moves, then the reply, the receipt and the settling", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.turns.end({ kind: "answered", answer: "1", text: "Hi." }, said.id);
  await receiptOn(rig, said);
  await until(() => rig.turns.settled.length === 1, "the message to be settled");

  const mine = rig.turns.calls.filter((call) => call.includes(said.id) || call === `setCursor ${String(said.seq)}`);
  assert.deepEqual(mine, [`record ${said.id}`, `start ${said.id}`, `setCursor ${String(said.seq)}`, `settle ${said.id}`]);
});

test("several messages answered by one turn get one reply and a receipt each", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const one = await sayAndWait(rig, "first");
  const two = await sayAndWait(rig, "second");
  const three = await sayAndWait(rig, "third");

  rig.turns.end({ kind: "answered", answer: "77", text: "All three, answered." }, one.id, two.id, three.id);

  const receipts = await Promise.all([one, two, three].map((message) => receiptOn(rig, message)));
  const replies = posted(rig);
  assert.equal(replies.length, 1);
  assert.deepEqual(
    receipts.map((receipt) => [receipt.status, receipt.reply]),
    [3, 3, 3].map(() => ["answered", replies[0]?.id]),
  );
  assert.equal(rig.turns.settled.length, 3);
});

test("messages answered by different turns each get their own reply", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const one = await sayAndWait(rig, "first");
  const two = await sayAndWait(rig, "second");

  rig.turns.end({ kind: "answered", answer: "1", text: "To the first." }, one.id);
  rig.turns.end({ kind: "answered", answer: "2", text: "To the second." }, two.id);

  await receiptOn(rig, one);
  await receiptOn(rig, two);
  assert.deepEqual(
    posted(rig).map((reply) => reply.text),
    ["To the first.", "To the second."],
  );
});

test("earlier messages that were shown with a message get its receipt too, and a skipped one is answered later", { timeout }, async (t) => {
  const chat = scriptedChat();
  const { thread } = chat.dm(zach, scout);
  const earlier = chat.say(zach, thread.id, "this one was skipped when work was stopped");
  const turns = scriptedTurns();
  await turns.setCursor(earlier.seq);
  await chat.join(scout).then(async (connection) => {
    await connection.chat.leaveReceipt([earlier.id], { status: "skipped", reply: null, detail: null });
    await connection.close();
  });
  turns.takeAlong(thread.id, [snapshotOf(earlier)]);
  const rig = await startIntakeRig(t, { chat, turns });

  const said = await sayAndWait(rig, "and this one came after");
  const blocks = rig.turns.handed.get(said.id)?.split("\n\n") ?? [];
  assert.equal(blocks.length, 3, "the model is shown where it is, then the earlier message, then this one");
  assert.equal(blocks[0], `Thread ${thread.id} in channel ${thread.channelId}.`);
  assert.match(blocks[1] ?? "", /\nthis one was skipped when work was stopped$/);
  assert.match(blocks[2] ?? "", /\nand this one came after$/);
  rig.turns.end({ kind: "answered", answer: "5", text: "Both answered." }, said.id);

  await receiptOn(rig, said);
  await eventually(
    () => rig.said().find((message) => message.id === earlier.id)?.receipts[0]?.status,
    (status) => status === "answered",
    { what: "the earlier message's receipt to change" },
  );
  const [reply] = posted(rig);
  assert.deepEqual(
    rig.said().map((message) => message.receipts[0]?.reply ?? null),
    [reply?.id, reply?.id, null],
  );
});

test("a turn whose final text is END leaves a silent receipt and posts nothing", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "thanks, bye");

  rig.turns.end({ kind: "answered", answer: "1", text: "**END**." }, said.id);

  assert.deepEqual(await receiptOn(rig, said), { memberId: "agent:scout", status: "silent", reply: null, detail: null });
  assert.deepEqual(posted(rig), []);
  await until(() => rig.turns.settled.length === 1, "the message to be settled");
});

test("a turn whose final text is empty is silent too", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hm");

  rig.turns.end({ kind: "answered", answer: "1", text: "  \n" }, said.id);

  assert.equal((await receiptOn(rig, said)).status, "silent");
  assert.deepEqual(posted(rig), []);
});

test("text followed by a last line of END is posted without that line", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "report back");

  rig.turns.end({ kind: "answered", answer: "1", text: "Done: the report is in the vault.\n\n`END`\n" }, said.id);

  const receipt = await receiptOn(rig, said);
  assert.equal(receipt.status, "answered");
  assert.deepEqual(
    posted(rig).map((reply) => reply.text),
    ["Done: the report is in the vault."],
  );
});

test("a turn that someone stopped leaves a stopped receipt, and says nothing", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "start the long job");

  rig.turns.end({ kind: "stopped" }, said.id);

  assert.deepEqual(await receiptOn(rig, said), { memberId: "agent:scout", status: "stopped", reply: null, detail: null });
  assert.deepEqual(posted(rig), []);
});

test("a message that was still waiting when work was stopped leaves a skipped receipt, and is settled as skipped", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "and then this");

  rig.turns.end({ kind: "skipped" }, said.id);

  assert.equal((await receiptOn(rig, said)).status, "skipped");
  await until(() => rig.turns.settled.length === 1, "the message to be settled");
  assert.deepEqual(rig.turns.settled[0]?.outcome, { kind: "skipped" });
});

test("a turn that failed leaves a failed receipt with its reason, cut to the most a receipt holds", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const short = await sayAndWait(rig, "one");
  const long = await sayAndWait(rig, "two");

  rig.turns.end({ kind: "failed", reason: "The model failed: it was overloaded." }, short.id);
  rig.turns.end({ kind: "failed", reason: "x".repeat(MAX_RECEIPT_DETAIL_LENGTH + 100) }, long.id);

  assert.deepEqual(await receiptOn(rig, short), {
    memberId: "agent:scout",
    status: "failed",
    reply: null,
    detail: "The model failed: it was overloaded.",
  });
  const cut = (await receiptOn(rig, long)).detail ?? "";
  assert.equal(cut.length, MAX_RECEIPT_DETAIL_LENGTH);
  assert.ok(cut.endsWith("x…"));
  assert.deepEqual(posted(rig), []);
});

test("a turn that failed takes back the messages waiting behind it in its thread, so each is marked skipped", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const first = await sayAndWait(rig, "first");
  const second = await sayAndWait(rig, "second");

  rig.turns.end({ kind: "failed", reason: "The model failed." }, first.id);

  assert.equal((await receiptOn(rig, first)).status, "failed");
  assert.equal((await receiptOn(rig, second)).status, "skipped");
  assert.deepEqual(
    rig.turns.calls.filter((call) => call.startsWith("withdraw")),
    [`withdraw ${second.id}`],
  );
  await until(() => rig.turns.settled.length === 2, "both messages to be settled");
  assert.deepEqual(posted(rig), []);
});

test("an answer longer than one message is posted in parts, in order, and the receipt points at the first", { timeout }, async (t) => {
  const rig = await startIntakeRig(t, { messageLimit: 40 });
  const said = await sayAndWait(rig, "tell me everything");
  const text = Array.from({ length: 12 }, (_, line) => `line number ${String(line)} of the answer`).join("\n");

  rig.turns.end({ kind: "answered", answer: "9", text }, said.id);

  const receipt = await receiptOn(rig, said);
  const parts = posted(rig);
  assert.ok(parts.length > 3);
  assert.equal(parts.map((part) => part.text).join(""), text);
  for (const part of parts) assert.ok(part.text.length <= 40, part.text);
  assert.equal(receipt.reply, parts[0]?.id);
  assert.deepEqual(rig.errors, []);
});

test("a reply waits while chat is unreachable, and is posted once, with its receipt, when chat is back", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.chat.down();

  rig.turns.end({ kind: "answered", answer: "1", text: "Here at last." }, said.id);
  await delay(80);
  assert.deepEqual(posted(rig), [], "nothing could be posted");
  assert.equal(rig.turns.settled.length, 0, "and it stays in the outbox");
  rig.chat.up();

  const receipt = await receiptOn(rig, said);
  assert.equal(receipt.status, "answered");
  assert.deepEqual(
    posted(rig).map((reply) => reply.text),
    ["Here at last."],
  );
  await until(() => rig.turns.settled.length === 1, "the message to be settled");
  assert.deepEqual(rig.errors, []);
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

test("a restarted agent takes up the replies the last one did not deliver, exactly once", { timeout }, async (t) => {
  const chat = scriptedChat();
  const turns = scriptedTurns();
  const first = await startIntakeRig(t, { chat, turns });
  const said = await sayAndWait(first, "hello");
  chat.down();
  turns.end({ kind: "answered", answer: "1", text: "Delivered after the restart." }, said.id);
  await delay(60);
  await first.intake.close();
  await first.link.close();
  chat.up();
  assert.deepEqual(posted(first), []);

  const second = await startIntakeRig(t, { chat, turns });

  await receiptOn(second, said);
  assert.deepEqual(
    posted(second).map((reply) => reply.text),
    ["Delivered after the restart."],
  );
  await until(() => turns.settled.length === 1, "the message to be settled");
  assert.equal(
    turns.calls.filter((call) => call === `start ${said.id}`).length,
    2,
    "handed over again, which the session takes as the same input",
  );
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

test("closing leaves what was not delivered in the outbox for the next start", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.chat.down();
  rig.turns.end({ kind: "answered", answer: "1", text: "Never posted." }, said.id);
  await delay(60);

  await rig.intake.close();

  assert.equal((await rig.turns.outstanding()).length, 1);
  assert.deepEqual(rig.turns.settled, []);
  assert.deepEqual(rig.errors, []);
});

test("draining waits for the turns that have ended to be delivered, and not for those still running", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const running = await sayAndWait(rig, "still running");
  const done = await sayAndWait(rig, "already done");
  const held = rig.chat.hold("post");
  rig.turns.end({ kind: "answered", answer: "1", text: "Finished." }, done.id);
  await eventually(() => held.arrived(), (arrived) => arrived === 1, { what: "the post to arrive" });

  let drained = false;
  const draining = rig.intake.drain(new AbortController().signal).then(() => {
    drained = true;
  });
  await delay(60);
  assert.equal(drained, false, "it waits for the reply that is on its way");
  held.release();
  await draining;

  assert.equal(drained, true);
  assert.equal(rig.turns.settled.length, 1);
  assert.equal((await rig.turns.outstanding()).length, 1, "the running turn is not waited for");
  assert.ok(running.id);
});

test("draining with nothing ended returns at once, and so does draining while chat is unreachable", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  await rig.intake.drain(new AbortController().signal);

  rig.chat.down();
  rig.turns.end({ kind: "answered", answer: "1", text: "Stuck." }, said.id);
  await settle();
  await delay(30);
  await rig.intake.drain(new AbortController().signal);

  assert.equal(rig.turns.settled.length, 0);
});

test("draining ends when it is told to stop waiting", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  const held = rig.chat.hold("post");
  rig.turns.end({ kind: "answered", answer: "1", text: "Slow." }, said.id);
  await eventually(() => held.arrived(), (arrived) => arrived === 1, { what: "the post to arrive" });
  const enough = new AbortController();

  const draining = rig.intake.drain(enough.signal);
  await delay(20);
  enough.abort();

  await draining;
  held.release();
});

test("turns already taken still finish when the agent stops taking messages", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");

  rig.intake.stopTaking();
  rig.turns.end({ kind: "answered", answer: "1", text: "Still delivered." }, said.id);

  assert.equal((await receiptOn(rig, said)).status, "answered");
});
