import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { test, type TestContext } from "node:test";
import { fauxAssistantMessage, type Message } from "@earendil-works/pi-ai";
import { attachLocal } from "../contracts/agent/node.ts";
import { tempDir, until } from "../lib/testing/index.ts";
import {
  type AgentRig,
  callingTools,
  loggedRequests,
  releaseGate,
  type Script,
  startAgentRig,
  talkTo,
  untilReleased,
} from "./testing/index.ts";

/*
 * An agent admitting events: what edits, reactions and receipts do to it, with the real
 * engine under it and the real chat server. The model answers with everything
 * it was shown since its last answer, so a test reads what reached it from the
 * reply.
 */

const timeout = 30_000;
const THUMBS_UP = "\u{1F44D}";

function textOf(message: Message): string {
  if (message.role !== "user") return "";
  return typeof message.content === "string" ? message.content : message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

/** Everything the model was shown since it last answered, oldest first. */
function shownSinceLastAnswer(messages: readonly Message[]): string {
  const answered = messages.findLastIndex((message) => message.role === "assistant");
  return messages.slice(answered + 1).map(textOf).join("\n");
}

const echoes: Script = (messages) => fauxAssistantMessage(`Shown:\n${shownSinceLastAnswer(messages)}`);

/** Like `echoes`, once the gate is open. */
const echoesWhenReleased: Script = async (messages, home) => {
  await untilReleased(home);
  return echoes(messages, home);
};

/** Start another agent on the first one's home and chat, as the next start would. */
function restart(t: TestContext, rig: AgentRig) {
  return startAgentRig(t, { home: rig.home, chat: rig.chat, script: echoes });
}

test("an edit of a message the agent already answered reaches it as an event and is answered on its own, and the two receipts name different events", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { script: echoes });
  const asked = await rig.say("Is the build green?");
  const first = await rig.receiptOn(asked);

  await rig.edit(asked, "Is the build green now?");
  const edit = (await rig.events()).find((event) => event.kind === "edited");
  assert.ok(edit);
  const second = await rig.receiptFor(edit);

  assert.deepEqual([first.status, second.status], ["answered", "answered"]);
  assert.deepEqual([first.event, second.event], [asked.event, edit.id]);
  const [firstReply, secondReply, ...others] = await rig.replies();
  assert.deepEqual(others, []);
  assert.deepEqual([first.reply, second.reply], [firstReply?.id, secondReply?.id], "two answers, told apart");
  assert.ok(firstReply?.text.includes("Is the build green?"));
  // The model is shown that it is an edit, of which message, and what the message says now.
  assert.match(secondReply?.text ?? "", /edited their message/);
  assert.ok(secondReply?.text.includes(new Date(asked.sentAt).toISOString().replace(/\.\d{3}Z$/, "Z")));
  assert.ok(secondReply?.text.includes("Is the build green now?"));
  const [message] = await rig.said();
  assert.deepEqual(
    message?.receipts.map((receipt) => receipt.event),
    [asked.event, edit.id],
    "the message carries both",
  );
});

test("an edit that arrives while its original waits behind a running turn: both are seen, in order, and answered once", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { script: echoesWhenReleased });
  const first = await rig.say("first");
  await rig.untilWorking();
  const second = await rig.say("second, as first written");
  await rig.edit(second, "second, as corrected");
  const edit = (await rig.events()).find((event) => event.kind === "edited");
  assert.ok(edit);

  releaseGate(rig.home);

  const receipts = await Promise.all([rig.receiptOn(first), rig.receiptOn(second), rig.receiptFor(edit)]);
  assert.deepEqual(receipts.map((receipt) => receipt.status), ["answered", "answered", "answered"]);
  const replies = await rig.replies();
  assert.equal(replies.length, 2, "the first message, and then the other two together");
  assert.equal(receipts[1].reply, receipts[2].reply);
  const shown = replies[1]?.text ?? "";
  assert.ok(shown.indexOf("as first written") !== -1 && shown.indexOf("as first written") < shown.indexOf("edited their message"));
  assert.ok(shown.indexOf("edited their message") < shown.indexOf("as corrected"));
});

test("a reaction to a message the agent wrote wakes it and is shown to it, and a reaction to anyone else's, one taken back and a delete wake nobody", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { script: echoes });
  const hello = await rig.say("Hello there");
  await rig.receiptOn(hello);
  const another = await rig.say("Another one");
  await rig.receiptOn(another);
  const [greeting] = await rig.replies();
  assert.ok(greeting);

  await rig.react(another, THUMBS_UP);
  const reacted = await rig.react(greeting, THUMBS_UP);
  assert.deepEqual(reacted.reactions, [{ emoji: THUMBS_UP, memberIds: [rig.me.id] }]);
  const reaction = (await rig.events()).findLast((event) => event.kind === "reacted" && event.message.id === greeting.id);
  assert.ok(reaction);
  const receipt = await rig.receiptFor(reaction);
  await rig.unreact(greeting, THUMBS_UP);
  await rig.remove(hello);
  // Everything is taken in order, so once the agent has answered this it has been past the rest.
  const last = await rig.say("The last word");
  await rig.receiptOn(last);

  assert.equal(receipt.status, "answered");
  const replies = await rig.replies();
  const answer = replies.find((reply) => reply.id === receipt.reply);
  const start = greeting.text.replace(/\s+/g, " ").slice(0, 30);
  for (const fact of [rig.me.name, THUMBS_UP, new Date(greeting.sentAt).toISOString().replace(/\.\d{3}Z$/, "Z"), start]) {
    assert.ok(answer?.text.includes(fact), `${fact} reached the model in\n${answer?.text}`);
  }
  const answered = (await rig.said()).flatMap((message) => message.receipts).map((each) => each.event);
  const woken = (await rig.events()).filter((event) => answered.includes(event.id)).map((event) => `${event.kind} ${event.message.id}`);
  assert.deepEqual(
    woken,
    [`posted ${hello.id}`, `posted ${another.id}`, `reacted ${greeting.id}`, `posted ${last.id}`],
    "a post, a post, the reaction to the agent's own reply, a post: nothing else was taken up",
  );
  assert.equal(loggedRequests(rig.home).length, 4, "and the model was asked once for each");

  // All of it shows when the thread is read.
  const standing = new Map((await rig.said()).map((message) => [message.id, message]));
  assert.deepEqual([standing.get(hello.id)?.deleted, standing.get(hello.id)?.text], [true, ""]);
  assert.deepEqual(standing.get(another.id)?.reactions, [{ emoji: THUMBS_UP, memberIds: [rig.me.id] }]);
  assert.deepEqual(standing.get(greeting.id)?.reactions, [], "the reaction to the agent's reply was taken back");
});

test("an agent that was down catches up on the events from its cursor, in order, after a restart", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { script: echoes });
  await rig.receiptOn(await rig.say("Before the stop"));
  const [greeting] = await rig.replies();
  assert.ok(greeting);
  await rig.agent.close();

  const missed = await rig.say("While you were away");
  await rig.edit(missed, "While you were away, again");
  await rig.react(greeting, THUMBS_UP);
  const next = await restart(t, rig);

  const events = await next.events();
  const edit = events.find((event) => event.kind === "edited");
  const reaction = events.find((event) => event.kind === "reacted");
  assert.ok(edit && reaction);
  const caughtUp = await Promise.all([next.receiptOn(missed), next.receiptFor(edit), next.receiptFor(reaction)]);
  assert.deepEqual(caughtUp.map((receipt) => receipt.status), ["answered", "answered", "answered"]);
  const replies = await next.replies();
  // The post starts a turn at once, and the edit and the reaction wait behind it and are answered together, in order.
  assert.equal(replies.length, 3);
  const together = replies[2]?.text ?? "";
  assert.ok(replies[1]?.text.includes("While you were away") && !replies[1].text.includes("edited their message"));
  assert.ok(together.indexOf("edited their message") !== -1 && together.indexOf("edited their message") < together.indexOf("reacted with"));
});

test("a chat store restored from an older copy gives new events the positions of ones the agent has answered, and they are answered all the same", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { script: echoes });
  await rig.receiptOn(await rig.say("before the copy"));
  await rig.chat.outage();
  const copy = tempDir(t, "chat-copy");
  cpSync(rig.chat.dataDir, copy, { recursive: true });
  await rig.chat.recover();
  const lost = await rig.say("after the copy, in the store that is lost");
  assert.equal((await rig.receiptOn(lost)).status, "answered");

  await rig.chat.outage();
  await rig.chat.recover({ dataDir: copy });
  await until(
    () => rig.reports.some((report) => /^Chat's log ends at \d+, before the agent's place in it at \d+\./.test((report as Error).message)),
    "the agent to say its place in the log was lost",
  );
  const fresh = await talkTo(rig.chat);
  const restored = await fresh.say("after the copy, in the store that came back");

  assert.equal(restored.seq, lost.seq, "the same position");
  assert.notEqual(restored.event, lost.event, "another event");
  assert.equal((await fresh.receiptOn(restored)).status, "answered");
  assert.equal((await fresh.replies()).filter((reply) => reply.text.includes("came back")).length, 1);
});

test("a receipt another member leaves on a message the agent wrote wakes the agent for nothing", { timeout }, async (t) => {
  const model = callingTools([[{ name: "send_message", args: { text: "Is the disk full?", to: "@mechanic" } }]], "I asked.");
  const rig = await startAgentRig(t, { script: model.script });
  const mechanic = await rig.chat.agent("mechanic");
  await rig.receiptOn(await rig.say("Ask the mechanic about the disk."));
  const [channel] = await mechanic.chat.channels();
  const [main] = await mechanic.chat.threads(channel?.id ?? "");
  const [question] = await mechanic.chat.read(main?.id ?? "", null, 10);
  assert.ok(question);

  // The agent wrote the question, so the mechanic's receipt on it is an event about a message of the agent's own.
  await mechanic.chat.leaveReceipt([question.event], { status: "failed", reply: null, detail: "No model was reachable." });
  const [receipt] = (await mechanic.chat.feed(question.seq, 10)).filter((event) => event.kind === "receipted");
  assert.deepEqual([receipt?.actor.id, receipt?.message.author.id], [mechanic.me.id, rig.partner.id]);
  // Everything is taken in order, so once the agent has answered this it has been past the receipt.
  await rig.receiptOn(await rig.say("The last word."));

  const connection = await attachLocal(rig.home);
  t.after(() => connection.close());
  assert.deepEqual(
    (await connection.sessions()).map((session) => session.threadId),
    [rig.thread.id],
    "the receipt started no session behind the mechanic's thread",
  );
  assert.deepEqual(rig.reports, []);
});
