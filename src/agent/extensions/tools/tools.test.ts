import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { validateToolArguments } from "@earendil-works/pi-ai/utils/validation";
import { agentMember } from "../../../contracts/chat/index.ts";
import { eventually, until } from "../../../lib/testing/index.ts";
import { callingTools, scout, startAgentRig, type ToolCall, toolsOf } from "../../testing/index.ts";

const timeout = 30_000;

const sentByScout = (messages: { author: { id: string }; text: string }[]): string[] =>
  messages.filter((message) => message.author.id === scout.id).map((message) => message.text);

test("send_message posts to the thread the turn came from, and the final text is still the reply", { timeout }, async (t) => {
  const model = callingTools([[{ name: "send_message", args: { text: "On it: checking the build." } }]], "The build is green.");
  const rig = await startAgentRig(t, { script: model.script });

  const asked = rig.say("Is the build green?");
  const receipt = await rig.receiptOn(asked);

  const [first, reply, ...others] = rig.replies();
  assert.ok(first && reply);
  assert.deepEqual(others, []);
  assert.equal(first.text, "On it: checking the build.");
  assert.equal(reply.text, "The build is green.");
  assert.equal(receipt.status, "answered");
  assert.equal(receipt.reply, reply.id, "the receipt points at the reply, not at what was sent along the way");
  assert.deepEqual(model.answers, [
    {
      name: "send_message",
      isError: false,
      text: "Posted to this thread. Your reply at the end of your turn is posted too, so if this said it all, finish with END.",
    },
  ]);
});

test("a message sent along the way goes to the thread it came from, side threads too, and @name to the DM's main thread", { timeout }, async (t) => {
  const model = callingTools([
    [{ name: "send_message", args: { text: "To the side thread." } }],
    [{ name: "send_message", args: { text: "To the main thread.", to: "@zach" } }],
  ]);
  const rig = await startAgentRig(t, { script: model.script });
  const side = await rig.newThread("a side topic");

  await rig.receiptOn(rig.say("from the side", side.id));
  await rig.receiptOn(rig.say("from the side again", side.id));

  assert.deepEqual(sentByScout(rig.said(side.id)), ["To the side thread.", "Done.", "Done."]);
  assert.deepEqual(sentByScout(rig.said(rig.thread.id)), ["To the main thread."]);
});

test("the same call ID in two turns is two posts, because each call is a task of its own", { timeout }, async (t) => {
  const call = { name: "send_message", args: { text: "Working on it." } };
  const model = callingTools([[call], [call]]);
  const rig = await startAgentRig(t, { script: model.script });

  await rig.receiptOn(rig.say("one"));
  await rig.receiptOn(rig.say("two"));

  assert.deepEqual(sentByScout(rig.said()), ["Working on it.", "Done.", "Working on it.", "Done."]);
});

test("read_messages gives the model the thread as it was said, in the same words a message arrives in", { timeout }, async (t) => {
  const model = callingTools([[], [{ name: "read_messages", args: { limit: 5 } }]]);
  const rig = await startAgentRig(t, { script: model.script });
  const earlier = rig.say("Earlier, I asked about the build.");
  await rig.receiptOn(earlier);

  const asked = rig.say("What did I ask you before?");
  await rig.receiptOn(asked);

  const [read] = model.answers;
  assert.equal(read?.name, "read_messages");
  assert.equal(read.isError, false);
  const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  assert.match(read.text, /^Messages in this thread, oldest first:\n\n/);
  assert.ok(read.text.includes(`Zach wrote at ${iso(earlier.sentAt)}:\nEarlier, I asked about the build.`), read.text);
  assert.ok(read.text.includes(`Zach wrote at ${iso(asked.sentAt)}:\nWhat did I ask you before?`), read.text);
});

test("a tool call that finds chat gone says so and does not wait, and the reply is delivered once chat is back", { timeout }, async (t) => {
  const model = callingTools([[{ name: "send_message", args: { text: "Anyone there?" } }]], "Chat was away, but I am here.");
  // Chat goes away just before the model asks for the tool, as it does when the connection drops in the middle of a turn.
  const script: typeof model.script = async (messages, home) => {
    if (messages.at(-1)?.role !== "toolResult") {
      await rig.chat.outage();
      // The agent finds out a moment after the server has closed the connection.
      await delay(50);
    }
    return model.script(messages, home);
  };
  const rig = await startAgentRig(t, { script });

  const asked = rig.say("Hello");
  await until(() => model.answers.length === 1, "the tool to answer");

  assert.deepEqual(model.answers, [
    {
      name: "send_message",
      isError: true,
      text: "Not sent: chat is unreachable right now, so nothing was posted. Try again later.",
    },
  ]);
  assert.deepEqual(sentByScout(rig.said()), [], "nothing was posted while chat was away");

  await rig.chat.recover();
  const receipt = await rig.receiptOn(asked);
  assert.equal(receipt.status, "answered");
  assert.deepEqual(sentByScout(rig.said()), ["Chat was away, but I am here."], "the reply waited in the outbox and was posted once");
});

test("the model is offered both tools, with what each is for and what each argument means", { timeout }, async (t) => {
  const model = callingTools([]);
  const rig = await startAgentRig(t, { script: model.script });

  await rig.receiptOn(rig.say("hello"));

  const offered = toolsOf(model.requests[0] ?? []);
  assert.deepEqual(
    offered.map((tool) => tool.name),
    ["read", "write", "edit", "bash", "send_message", "read_messages"],
  );
  const [send, read] = offered.slice(4);
  assert.ok(send && read);
  assert.equal(
    send.description,
    "Post a message now, without ending your turn. Use it to tell someone something before you finish, or to write " +
      "somewhere other than this thread. What you write last is still posted as your reply, so don't use this to answer.",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(send.parameters)), {
    type: "object",
    properties: {
      text: { type: "string", description: "The message to post." },
      to: {
        type: "string",
        description: "Where to post it: @name for your DM with that person or agent. Leave it out to post to this thread.",
      },
    },
    required: ["text"],
  });
  assert.equal(
    read.description,
    "Read the newest messages of a thread, oldest first. Use it to see what was said earlier, in this thread or in your DM with someone.",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(read.parameters)), {
    type: "object",
    properties: {
      from: {
        type: "string",
        description: "Which thread to read: @name for your DM with that person or agent. Leave it out to read this thread.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "How many messages to read. 20 if you leave it out, and at most 100.",
      },
      before: {
        type: "integer",
        minimum: 0,
        description: "A number from an earlier result: read only the messages before it. The result says which number to use.",
      },
    },
  });
});

test("the engine takes only arguments that fit: text is needed, and limit is a whole number from 1 to 100", { timeout }, async (t) => {
  const model = callingTools([]);
  const rig = await startAgentRig(t, { script: model.script });
  await rig.receiptOn(rig.say("hello"));
  const [send, read] = toolsOf(model.requests[0] ?? []).slice(4);
  assert.ok(send && read);
  const call = (name: string, arguments_: ToolCall["args"]) => ({ type: "toolCall" as const, id: "c", name, arguments: arguments_ });

  assert.deepEqual(validateToolArguments(send, call("send_message", { text: "hi" })), { text: "hi" });
  assert.throws(() => validateToolArguments(send, call("send_message", {})), /text/);
  assert.deepEqual(validateToolArguments(read, call("read_messages", { limit: "5" })), { limit: 5 });
  assert.throws(() => validateToolArguments(read, call("read_messages", { limit: 0 })));
  assert.throws(() => validateToolArguments(read, call("read_messages", { limit: 101 })));
  assert.throws(() => validateToolArguments(read, call("read_messages", { before: -1 })));
});

test("the tools are shown to a person watching the session like any other tool call, with their answers", { timeout }, async (t) => {
  const model = callingTools([[{ name: "send_message", args: { text: "Hello there." } }, { name: "read_messages", args: {} }]]);
  const rig = await startAgentRig(t, { script: model.script });

  await rig.receiptOn(rig.say("hi"));

  const { session } = await rig.attach();
  const tools = session.view.items.filter((item) => item.type === "tool");
  assert.deepEqual(
    tools.map((tool) => [tool.name, tool.status, JSON.parse(tool.args) as unknown]),
    [
      ["send_message", "done", { text: "Hello there." }],
      ["read_messages", "done", {}],
    ],
  );
  await eventually(() => model.answers.length, (count) => count === 2, { what: "both answers" });
  assert.match(tools[0]?.output ?? "", /^Posted to this thread\./);
  assert.match(tools[1]?.output ?? "", /^Messages in this thread, oldest first:/);
});

test("an agent can message another it already has a DM with, and the other's thread is where it lands", { timeout }, async (t) => {
  const mechanic = agentMember("mechanic");
  const model = callingTools([[{ name: "send_message", args: { text: "The build is red.", to: "@mechanic" } }]]);
  const rig = await startAgentRig(t, { script: model.script });
  const { thread: dm } = rig.chat.chat.dm(scout, mechanic);

  await rig.receiptOn(rig.say("tell the mechanic"));

  assert.deepEqual(sentByScout(rig.chat.chat.messages(dm.id)), ["The build is red."]);
  assert.equal(rig.chat.chat.messages(dm.id)[0]?.addressed[0], mechanic.id);
  assert.deepEqual(sentByScout(rig.said()), ["Done."], "and the reply still goes to the person who asked");
});
