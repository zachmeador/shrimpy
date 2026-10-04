import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { agentMember } from "../../../contracts/chat/index.ts";
import { until } from "../../../lib/testing/index.ts";
import { callingTools, scout, startAgentRig } from "../../testing/index.ts";

const timeout = 30_000;

const sentByScout = (messages: { author: { id: string }; text: string }[]): string[] =>
  messages.filter((message) => message.author.id === scout.id).map((message) => message.text);

test("send_message posts to the thread the turn came from, and the final text is still the reply", { timeout }, async (t) => {
  const model = callingTools([[{ name: "send_message", args: { text: "On it: checking the build." } }]], "The build is green.");
  const rig = await startAgentRig(t, { script: model.script });

  const receipt = await rig.receiptOn(await rig.say("Is the build green?"));

  const [first, reply, ...others] = await rig.replies();
  assert.ok(first && reply);
  assert.deepEqual(others, []);
  assert.equal(first.text, "On it: checking the build.");
  assert.equal(reply.text, "The build is green.");
  assert.equal(receipt.status, "answered");
  assert.equal(receipt.reply, reply.id, "the receipt points at the reply, not at what was sent along the way");
  assert.deepEqual(model.answers.map((answer) => [answer.name, answer.isError]), [["send_message", false]]);
});

test("a message sent along the way goes to the thread it came from, side threads too, and @name to the DM's main thread", { timeout }, async (t) => {
  const model = callingTools([
    [{ name: "send_message", args: { text: "To the side thread." } }],
    [{ name: "send_message", args: { text: "To the main thread.", to: "@zach" } }],
  ]);
  const rig = await startAgentRig(t, { script: model.script });
  const side = await rig.newThread("a side topic");

  await rig.receiptOn(await rig.say("from the side", side.id));
  await rig.receiptOn(await rig.say("from the side again", side.id));

  assert.deepEqual(sentByScout(await rig.said(side.id)), ["To the side thread.", "Done.", "Done."]);
  assert.deepEqual(sentByScout(await rig.said(rig.thread.id)), ["To the main thread."]);
});

test("the same call ID in two turns is two posts, because each call is a task of its own", { timeout }, async (t) => {
  const call = { name: "send_message", args: { text: "Working on it." } };
  const model = callingTools([[call], [call]]);
  const rig = await startAgentRig(t, { script: model.script });

  await rig.receiptOn(await rig.say("one"));
  await rig.receiptOn(await rig.say("two"));

  assert.deepEqual(sentByScout(await rig.said()), ["Working on it.", "Done.", "Working on it.", "Done."]);
});

test("read_messages gives the model the thread as it was said, in the same words a message arrives in", { timeout }, async (t) => {
  const model = callingTools([[], [{ name: "read_messages", args: { limit: 5 } }]]);
  const rig = await startAgentRig(t, { script: model.script });
  const earlier = await rig.say("Earlier, I asked about the build.");
  await rig.receiptOn(earlier);

  const asked = await rig.say("What did I ask you before?");
  await rig.receiptOn(asked);

  const [read] = model.answers;
  assert.equal(read?.name, "read_messages");
  assert.equal(read.isError, false);
  const iso = new Date(earlier.sentAt).toISOString().replace(/\.\d{3}Z$/, "Z");
  assert.ok(read.text.includes(`Zach wrote at ${iso}:\nEarlier, I asked about the build.`), read.text);
  assert.ok(read.text.indexOf(earlier.text) < read.text.indexOf(asked.text), "oldest first");
});

test("tools that find chat gone say so and do not wait, and the reply is delivered once chat is back", { timeout }, async (t) => {
  const model = callingTools(
    [[{ name: "send_message", args: { text: "Anyone there?" } }, { name: "read_messages", args: {} }]],
    "Chat was away, but I am here.",
  );
  // Chat goes away just before the model asks for the tools, as it does when the connection drops in the middle of a turn.
  const script: typeof model.script = async (messages, home) => {
    if (messages.at(-1)?.role !== "toolResult") {
      await rig.chat.outage();
      // The agent finds out a moment after the server has closed the connection.
      await delay(50);
    }
    return model.script(messages, home);
  };
  const rig = await startAgentRig(t, { script });

  const asked = await rig.say("Hello");
  await until(() => model.answers.length === 2, "the tools to answer");

  assert.deepEqual(model.answers.map((answer) => [answer.name, answer.isError]), [
    ["send_message", true],
    ["read_messages", true],
  ]);

  await rig.chat.recover();
  const receipt = await rig.receiptOn(asked);
  assert.equal(receipt.status, "answered");
  assert.deepEqual(sentByScout(await rig.said()), ["Chat was away, but I am here."], "the reply waited in the outbox and was posted once");
});

test("an agent can message another it already has a DM with, and the other's thread is where it lands", { timeout }, async (t) => {
  const mechanic = agentMember("mechanic");
  const model = callingTools([[{ name: "send_message", args: { text: "The build is red.", to: "@mechanic" } }]]);
  const rig = await startAgentRig(t, { script: model.script });
  const dm = await rig.dm(scout, mechanic);

  await rig.receiptOn(await rig.say("tell the mechanic"));

  const [sent] = await dm.said();
  assert.deepEqual(sentByScout(await dm.said()), ["The build is red."]);
  assert.equal(sent?.addressed[0], mechanic.id);
  assert.deepEqual(sentByScout(await rig.said()), ["Done."], "and the reply still goes to the person who asked");
});
