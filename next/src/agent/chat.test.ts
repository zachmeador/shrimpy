import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { MAX_MESSAGE_LENGTH } from "../contracts/chat/index.ts";
import { eventually, until, waitForView } from "../lib/testing/index.ts";
import { answered, assistantItems, releaseGate, type Script, startAgentRig, untilReleased } from "./testing/index.ts";

/*
 * An agent taking part in chat, with the real engine under it: what a message
 * becomes, what comes back, and what happens when chat or the agent is not
 * there. The chat is a stand-in served over a real socket.
 */

const timeout = 30_000;

const written = (iso: string): string => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");

/** A model that answers with the JSON text after "reply with:" in the latest message it is sent. */
const saysWhatItIsToldTo: Script = (messages) => {
  const user = messages.findLast((message) => message.role === "user");
  const content = user?.content ?? "";
  const text = typeof content === "string" ? content : content.map((block) => (block.type === "text" ? block.text : "")).join("");
  const wanted = /reply with: (.*)$/s.exec(text)?.[1];
  return fauxAssistantMessage(wanted === undefined ? "no instruction" : (JSON.parse(wanted) as string));
};

test("a message in a DM becomes a turn, and only the turn's final text is the reply", { timeout }, async (t) => {
  const rig = await startAgentRig(t);

  const asked = rig.say("show me the files");

  const receipt = await rig.receiptOn(asked);
  const [reply, ...others] = rig.replies();
  assert.ok(reply);
  assert.deepEqual(others, []);
  assert.deepEqual(receipt, { memberId: "agent:scout", status: "answered", reply: reply.id, detail: null });
  assert.ok(reply.text.startsWith("The command finished.\n\n- first point"), "not what it said while it worked");
  assert.doesNotMatch(reply.text, /Let me look at the work directory/);
  assert.deepEqual(rig.reports, []);
});

test("the agent is working in the thread from picking a message up until its reply and receipt are in", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { scenario: "gated" });
  assert.deepEqual(rig.chat.chat.working(rig.thread.id), []);

  const asked = rig.say("hello");

  await until(() => rig.chat.chat.working(rig.thread.id).length === 1, "the thread to be marked");
  assert.deepEqual(
    rig.chat.chat.working(rig.thread.id).map((mark) => mark.memberId),
    ["agent:scout"],
  );
  releaseGate(rig.home);
  await rig.receiptOn(asked);
  await until(() => rig.chat.chat.working(rig.thread.id).length === 0, "the mark to be cleared");
  assert.equal(rig.replies().length, 1);
});

test("a stop with a message waiting: the message is skipped, and the next turn in the thread shows it", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 40 });
  const running = rig.say("stream a long answer");
  await until(() => rig.chat.chat.working(rig.thread.id).length === 1, "the agent to take the message up");
  const { session } = await rig.attach();
  await waitForView(session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 20);
  const waiting = rig.say("this one waits behind the first");
  await waitForView(session, (view) => view.status.queued.length === 1);

  await session.stop();

  assert.equal((await rig.receiptOn(running)).status, "stopped");
  assert.equal((await rig.receiptOn(waiting)).status, "skipped");
  assert.deepEqual(rig.replies(), [], "nothing is posted for work that was stopped");

  const next = rig.say("now answer me");
  const receipt = await rig.receiptOn(next);

  assert.equal(receipt.status, "answered");
  const [reply, ...others] = rig.replies();
  assert.deepEqual(others, [], "one turn, one reply");
  const prompt = (message: typeof next): string =>
    `Zach wrote at ${written(new Date(message.sentAt).toISOString())}:\n${message.text}`;
  assert.equal(
    reply?.text.split("\n\n- first point")[0],
    `You said: Thread ${rig.thread.id} in channel ${rig.thread.channelId}.\n\n${prompt(waiting)}\n\n${prompt(next)}`,
    "the skipped message, as written, then the new one",
  );
  // The turn that answered the new message answered the skipped one too, and the receipts say so.
  assert.deepEqual(
    [(await rig.receiptOn(waiting)).status, (await rig.receiptOn(waiting)).reply, receipt.reply],
    ["answered", reply.id, reply.id],
  );

  const after = rig.say("and once more");
  await rig.receiptOn(after);
  assert.doesNotMatch(rig.replies()[1]?.text ?? "", /this one waits behind the first/, "it is not shown twice");
});

test("messages that arrive while the agent is busy are answered together, by one reply", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { scenario: "gated" });
  const messages = ["first", "second", "third"].map((text) => rig.say(text));
  await until(() => rig.chat.chat.working(rig.thread.id).length === 1, "the thread to be marked");

  releaseGate(rig.home);

  for (const message of messages) await rig.receiptOn(message);
  // The first was being answered when the other two arrived, so those two are picked up together.
  const [first, together] = rig.replies();
  assert.ok(first && together);
  assert.equal(rig.replies().length, 2);
  assert.match(first.text, /first\n\n- first point/);
  assert.match(together.text, /third\n\n- first point/);
  const receipts = await Promise.all(messages.map((message) => rig.receiptOn(message)));
  assert.deepEqual(
    receipts.map((receipt) => receipt.reply),
    [first.id, together.id, together.id],
  );
});

test("a final text of END, in any of its forms, is silent, and a last line of END is not posted", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { script: saysWhatItIsToldTo });
  // What the model's final text is, and what the thread should end up with: "silent" for nothing, or the reply.
  const cases: [string, string][] = [
    ["END", "silent"],
    ["  END\n", "silent"],
    ['"END"', "silent"],
    ["`END`", "silent"],
    ["**END**", "silent"],
    ["END.", "silent"],
    ["", "silent"],
    ["Done.\nEND", "Done."],
    ["Done, nothing more.\n\n`END`.\n", "Done, nothing more."],
    ["The END", "The END"],
    ["Fine.", "Fine."],
  ];

  for (const [text, outcome] of cases) {
    const before = rig.replies().length;
    const asked = rig.say(`reply with: ${JSON.stringify(text)}`);
    const receipt = await rig.receiptOn(asked);
    if (outcome === "silent") {
      assert.deepEqual([receipt.status, receipt.reply, rig.replies().length], ["silent", null, before], JSON.stringify(text));
    } else {
      assert.equal(receipt.status, "answered", JSON.stringify(text));
      assert.equal(rig.replies().at(-1)?.text, outcome);
      assert.equal(receipt.reply, rig.replies().at(-1)?.id);
    }
  }
});

test("a turn that failed leaves a failed receipt with a reason, and posts nothing", { timeout }, async (t) => {
  const rig = await startAgentRig(t);

  const asked = rig.say("please refuse");

  assert.deepEqual(await rig.receiptOn(asked), {
    memberId: "agent:scout",
    status: "failed",
    reply: null,
    detail: "The model failed: The model refused the request.",
  });
  assert.deepEqual(rig.replies(), []);
  await until(() => rig.chat.chat.working(rig.thread.id).length === 0, "the mark to be cleared");
});

test("an answer longer than one message is posted in parts, and the receipt points at the first", { timeout }, async (t) => {
  const lines = Array.from({ length: 9000 }, (_, line) => `line ${String(line).padStart(5, "0")}: ${"x".repeat(52)}`);
  const text = lines.join("\n");
  assert.ok(text.length > MAX_MESSAGE_LENGTH && text.length < 2 * MAX_MESSAGE_LENGTH);
  const rig = await startAgentRig(t, {
    script: () => fauxAssistantMessage(text),
    tokensPerSecond: 1_000_000,
    tokenSize: { min: 50_000, max: 50_000 },
  });

  const asked = rig.say("tell me everything");

  const receipt = await eventually(() => rig.chat.chat.messages().find((m) => m.id === asked.id)?.receipts[0], (r) => r !== undefined, {
    what: "the receipt",
    timeoutMs: 25_000,
  });
  const parts = rig.replies();
  assert.equal(parts.length, 2);
  assert.equal(parts.map((part) => part.text).join(""), text);
  for (const part of parts) assert.ok(part.text.length <= MAX_MESSAGE_LENGTH);
  assert.equal(receipt?.reply, parts[0]?.id);
  assert.deepEqual(rig.reports, []);
});

test("a chat server whose store was replaced under the agent makes it read the new log from the start", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(rig.say("before"));
  await rig.receiptOn(rig.say("before again"));

  rig.chat.chat.replace();
  const { thread } = rig.chat.chat.dm({ id: "person:zach", kind: "person", name: "Zach" }, { id: "agent:scout", kind: "agent", name: "scout" });
  await rig.chat.outage();
  await rig.chat.recover();
  await until(
    () => rig.reports.some((report) => /^Chat's log ends at 0, before the agent's place in it at \d+\./.test((report as Error).message)),
    "the agent to say its place in the log was lost",
  );
  const fresh = rig.say("first message of the new store", thread.id);

  assert.equal((await rig.receiptOn(fresh)).status, "answered");
  assert.equal(fresh.seq, 1);
});

test("while chat is unreachable the sessions keep working, and clients can still watch, steer and stop them", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 400 });
  await rig.receiptOn(rig.say("hello"));
  const { session } = await rig.attach();

  await rig.chat.outage();
  const { submission } = await session.steer("say hello without chat");
  assert.equal((await session.wait(submission)).status, "answered");
  const streaming = await session.steer("stream a long answer");
  await waitForView(session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 20);
  await session.stop();
  assert.deepEqual(await session.wait(streaming.submission), { status: "cancelled" });
  await waitForView(session, (view) => !view.status.busy);

  await rig.chat.recover();
  const after = rig.say("welcome back");
  assert.equal((await rig.receiptOn(after)).status, "answered");
  assert.equal(rig.replies().length, 2, "nothing was posted for the input that came by way of the console");
});

test("a reply whose turn ended while chat was unreachable is posted once chat is back, and only once", { timeout }, async (t) => {
  const rig = await startAgentRig(t, {
    script: async (messages, home) => {
      await untilReleased(home);
      return fauxAssistantMessage(`Answer to ${String(messages.length)} messages.`);
    },
  });
  const asked = rig.say("hello");
  await until(() => rig.chat.chat.working(rig.thread.id).length === 1, "the thread to be marked");
  const { session } = await rig.attach();

  await rig.chat.outage();
  releaseGate(rig.home);
  await waitForView(session, answered);
  await delay(100);
  assert.deepEqual(rig.replies(), []);
  await rig.chat.recover();

  assert.equal((await rig.receiptOn(asked)).status, "answered");
  assert.deepEqual(
    rig.replies().map((reply) => reply.text),
    ["Answer to 2 messages."],
  );
  await until(() => rig.chat.chat.working(rig.thread.id).length === 0, "the mark to be cleared");
  await rig.chat.outage();
  await rig.chat.recover();
  await delay(150);
  assert.equal(rig.replies().length, 1, "and a reconnection posts nothing again");
});
