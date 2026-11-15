import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Chat } from "../../contracts/chat/index.ts";
import { until } from "../../lib/testing/index.ts";
import { standing, written } from "../inputs/index.ts";
import { callingTools, startAgentRig } from "../testing/index.ts";
import { onChannel, onThread, valueOf } from "../../contracts/chat/testing/index.ts";

const timeout = 30_000;

const sentBy = (id: string, messages: { author: { id: string }; text: string }[]): string[] =>
  messages.filter((message) => message.author.id === id).map((message) => message.text);

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
    [{ name: "send_message", args: { text: "To the main thread.", to: `@${userInfo().username}` } }],
  ]);
  const rig = await startAgentRig(t, { script: model.script });
  const side = await rig.newThread("a side topic");

  await rig.receiptOn(await rig.say("from the side", side.id));
  await rig.receiptOn(await rig.say("from the side again", side.id));

  assert.deepEqual(sentBy(rig.partner.id, await rig.said(side.id)), ["To the side thread.", "Done.", "Done."]);
  assert.deepEqual(sentBy(rig.partner.id, await rig.said(rig.thread.id)), ["To the main thread."]);
});

test("the same call ID in two turns is two posts, because each call is a task of its own", { timeout }, async (t) => {
  const call = { name: "send_message", args: { text: "Working on it." } };
  const model = callingTools([[call], [call]]);
  const rig = await startAgentRig(t, { script: model.script });

  await rig.receiptOn(await rig.say("one"));
  await rig.receiptOn(await rig.say("two"));

  assert.deepEqual(sentBy(rig.partner.id, await rig.said()), ["Working on it.", "Done.", "Working on it.", "Done."]);
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
  const arrived = written({ kind: "posted", id: earlier.event, seq: earlier.seq, author: rig.me.name, sentAt: earlier.sentAt, text: earlier.text });
  assert.ok(read.text.includes(arrived), read.text);
  assert.ok(read.text.indexOf(earlier.text) < read.text.indexOf(asked.text), "oldest first");
});

test("read_messages gives the model each message as it now stands", { timeout }, async (t) => {
  // The edit is a turn of its own, and the last turn is the one that reads.
  const model = callingTools([[], [], [], [{ name: "read_messages", args: { limit: 10 } }]]);
  const rig = await startAgentRig(t, { script: model.script });
  const kept = await rig.say("Is the build green?");
  await rig.receiptOn(kept);
  const dropped = await rig.say("Ignore this one.");
  await rig.receiptOn(dropped);
  await rig.edit(kept, "Is the build green now?");
  await rig.receiptFor((await rig.events()).findLast((event) => event.kind === "edited")!);
  await rig.react(kept, "\u{1F44D}");
  await rig.remove(dropped);

  const asked = await rig.say("What was said?");
  await rig.receiptOn(asked);

  const [read] = model.answers;
  assert.equal(read?.name, "read_messages");
  const now = new Map((await rig.said()).map((message) => [message.id, message]));
  const nameOf = (memberId: string): string => (memberId === rig.me.id ? rig.me.name : memberId);
  for (const message of [now.get(kept.id), now.get(dropped.id)]) {
    assert.ok(message && read.text.includes(standing(message, nameOf)), read.text);
  }
  assert.ok(!read.text.includes("Is the build green?\n"), "not what it said before");
  assert.ok(!read.text.includes("Ignore this one."), "and not what it said");
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
  assert.deepEqual(sentBy(rig.partner.id, await rig.said()), ["Chat was away, but I am here."], "the reply waited for chat and was posted once");
});

test("an agent starts a DM with a member it has never talked to, by name, and says who there is when the name is nobody's", { timeout }, async (t) => {
  const model = callingTools([
    [
      { name: "send_message", args: { text: "The build is red.", to: "@Mechanic" } },
      { name: "read_messages", args: { from: "@mechanic" } },
      { name: "send_message", args: { text: "Anyone?", to: "@nobody" } },
    ],
  ]);
  const rig = await startAgentRig(t, { script: model.script });
  const mechanic = await rig.chat.agent("mechanic");
  const theirs = await mechanic.host.get(Chat, {}, BACKGROUND_CONTEXT);
  assert.equal(theirs.channels.value.length, 0, "they have never talked");

  await rig.receiptOn(await rig.say("tell the mechanic"));

  await until(() => theirs.channels.value.length > 0, "the mechanic to see the DM");
  const [channel] = theirs.channels.value;
  assert.ok(channel);
  assert.equal(channel.name, "scout", "the mechanic sees a DM with the agent");
  const main = await onChannel(mechanic, channel.id, (held) => held.threads.value.find((thread) => thread.main));
  assert.ok(main);
  const [sent, ...others] = await onThread(mechanic, main.id, async (held) =>
    valueOf(await held.read({ before: null, limit: 10 }, BACKGROUND_CONTEXT)),
  );
  assert.deepEqual(others, []);
  assert.equal(sent?.text, "The build is red.");
  assert.equal(sent.author.id, rig.partner.id);
  assert.deepEqual(sent.mentions, []);
  assert.deepEqual(sentBy(rig.partner.id, await rig.said()), ["Done."], "and the reply still goes to the person who asked");
  const [posted, read, refused] = model.answers;
  assert.equal(posted?.isError, false);
  assert.ok(read?.text.includes("The build is red."), "the DM it started can be read");
  assert.equal(refused?.isError, true);
  assert.ok(refused.text.includes("@nobody"));
  for (const name of [rig.me.name, "scout", "mechanic"]) assert.ok(refused.text.includes(name), `it names ${name}`);
});
