import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { Message } from "../contracts/chat/index.ts";
import type { Entered } from "../contracts/chat/testing/index.ts";
import { eventually, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import {
  callingTools,
  loggedRequests,
  type Script,
  startAgentChild,
  startAgentRig,
  startChatServer,
  talking,
  talkTo,
} from "./testing/index.ts";

/*
 * An agent asking another agent a question with `ask_agent`: the real engine
 * under it and the real chat server. The model of each agent is scripted, and
 * says what it was shown. An agent that is not under test comes in as a member
 * of its own, and the test plays its side.
 */

const timeout = 60_000;
/** How long to wait for what an agent does next, in milliseconds: the turns of several agents follow one another. */
const PATIENT = 30_000;

/** The main thread of `viewer`'s DM with `other`, and the messages said in it so far. */
async function dmOf(viewer: Entered, other: string): Promise<{ threadId: string; messages: () => Promise<Message[]> }> {
  const [channel] = await eventually(
    async () => (await viewer.chat.channels()).filter((each) => each.kind === "dm" && each.name === other),
    (found) => found.length > 0,
    { what: `${viewer.me.name}'s DM with ${other}` },
  );
  const main = (await viewer.chat.threads(channel?.id ?? "")).find((thread) => thread.main);
  assert.ok(main);
  return { threadId: main.id, messages: () => viewer.chat.read(main.id, null, 100) };
}

/** Answer a message in `member`'s name, as an agent does when its turn ends: post the reply, then leave a receipt on the event it answers. */
async function answer(member: Entered, threadId: string, text: string, event: string, requestId: string): Promise<Message> {
  const reply = await member.chat.post(threadId, text, requestId);
  await member.chat.leaveReceipt([event], { status: "answered", reply: reply.id, detail: null });
  return reply;
}

test("a question asked in a thread with a person is answered in that thread: maya answers in their DM, the session behind the thread is woken with the answer, and the session behind the DM is not", { timeout }, async (t) => {
  const asking = talking((_shown, turn) =>
    turn === 0 ? { ask: { to: "@maya", text: "Which stanza will you take?" }, final: "I asked maya." } : { final: "Maya says stanza 2." },
  );
  const answering = talking(() => ({ final: "Stanza 2." }));
  const scout = await startAgentRig(t, { script: asking.script });
  const maya = await startAgentRig(t, { name: "maya", chat: scout.chat, script: answering.script });

  await scout.say("Ask maya which stanza she takes.");

  const told = await eventually(() => scout.replies(), (replies) => replies.length === 2, { what: "scout to tell the person what maya said", timeoutMs: PATIENT });
  assert.deepEqual(told.map((reply) => reply.text), ["I asked maya.", "Maya says stanza 2."], "the reply to the answer is posted in the thread the question came from");
  await scout.untilIdle();

  assert.equal(asking.shown.length, 2, "the person's message, and then the answer: nothing woke scout in the DM");
  const shown = asking.shown[1] ?? "";
  for (const fact of [`Thread ${scout.thread.id}`, "maya", "Which stanza will you take?", "Stanza 2."]) {
    assert.ok(shown.includes(fact), `${fact} reached the model in\n${shown}`);
  }
  assert.deepEqual(
    (await (await scout.connect()).sessions()).map((session) => session.threadId),
    [scout.thread.id],
    "scout has no session behind its DM with maya",
  );
  assert.equal(answering.shown.length, 1, "maya was woken by the question and by nothing else");
  assert.deepEqual([scout.reports, maya.reports], [[], []]);
});

test("when maya reads the question and says nothing, and when her turn fails, scout is told each at once", { timeout }, async (t) => {
  const asking = talking((_shown, turn) => {
    if (turn === 0) return { ask: { to: "@maya", text: "Which stanza will you take?" }, final: "I asked maya." };
    if (turn === 1) return { ask: { to: "@maya", text: "And which key?" }, final: "I asked again." };
    return { final: "Noted." };
  });
  // Maya says nothing to the first question, and her model refuses the second.
  let questions = 0;
  const answering: Script = () =>
    ++questions === 1 ? fauxAssistantMessage("END") : fauxAssistantMessage([], { stopReason: "error", errorMessage: "The model refused the request." });
  const scout = await startAgentRig(t, { script: asking.script });
  const maya = await startAgentRig(t, { name: "maya", chat: scout.chat, script: answering });

  await scout.say("Ask maya which stanza she takes.");

  // The time to wait is half an hour, so being told now is being told by the receipts.
  await eventually(() => asking.shown.length, (count) => count === 3, { what: "scout to be told both times", timeoutMs: PATIENT });
  const [, silent = "", failed = ""] = asking.shown;
  for (const fact of ["maya", "Which stanza will you take?"]) assert.ok(silent.includes(fact), `${fact} reached the model in\n${silent}`);
  for (const fact of ["maya", "And which key?", "The model refused the request."]) assert.ok(failed.includes(fact), `${fact} reached the model in\n${failed}`);
  await scout.untilIdle();
  assert.equal(asking.shown.length, 3, "and each was told once");
  assert.deepEqual([scout.reports, maya.reports], [[], []]);
});

test("a question that gets no answer in time is closed once, and an answer that comes later wakes the session behind the DM as any message does", { timeout }, async (t) => {
  const asking = talking((_shown, turn) =>
    turn === 0 ? { ask: { to: "@maya", text: "Which stanza will you take?", within: "1s" }, final: "I asked maya." } : { final: "Noted." },
  );
  const scout = await startAgentRig(t, { script: asking.script, shortestWaitMs: 1_000 });
  const maya = await scout.chat.agent("maya");

  const started = Date.now();
  await scout.receiptOn(await scout.say("Ask maya which stanza she takes."));
  await eventually(() => asking.shown.length, (count) => count === 2, { what: "scout to be told maya has not answered", timeoutMs: PATIENT });
  assert.ok(Date.now() - started >= 1_000, "not before the time was up");
  const told = asking.shown[1] ?? "";
  for (const fact of ["maya", "Which stanza will you take?"]) assert.ok(told.includes(fact), `${fact} reached the model in\n${told}`);

  // Maya answers too late. It is a message in the DM like any other, and the receipt she leaves on the question wakes nobody.
  const dm = await dmOf(maya, "scout");
  const [question] = await dm.messages();
  assert.ok(question);
  await answer(maya, dm.threadId, "Stanza 2.", question.event, "maya-1");
  await eventually(() => asking.shown.length, (count) => count === 3, { what: "scout to be woken in the DM", timeoutMs: PATIENT });
  const late = asking.shown[2] ?? "";
  assert.ok(late.includes("maya wrote at") && late.includes("Stanza 2."), `shown as any message in a DM is:\n${late}`);
  assert.deepEqual(
    (await (await scout.connect()).sessions()).map((session) => session.threadId).sort(),
    [scout.thread.id, dm.threadId].sort(),
    "scout has a session behind the DM now",
  );

  // Everything is taken in order, so once the agent has answered this it has been past the receipt.
  await scout.receiptOn(await scout.say("The last word."), PATIENT);
  assert.equal(asking.shown.length, 4);
  assert.ok((asking.shown[3] ?? "").includes("The last word."));
  assert.equal(asking.shown.filter((shown) => shown.includes("Which stanza will you take?")).length, 1, "scout was told once");
  assert.deepEqual(scout.reports, []);
});

test("scout is killed after it asked and before maya answered: when it is back the answer is taken up once", { timeout }, async (t) => {
  useRuntimeDir(t);
  const home = tempDir(t, "asking");
  const chat = await startChatServer(t);
  const first = await startAgentChild(t, home, "mixed", 400);
  const talk = await talkTo(chat);
  const maya = await chat.agent("maya");
  await talk.receiptOn(await talk.say("Ask maya which stanza she takes."), PATIENT);
  const dm = await dmOf(maya, "scout");
  const [question] = await dm.messages();
  assert.ok(question);

  await first.kill("SIGKILL");
  await answer(maya, dm.threadId, "Stanza 2.", question.event, "maya-1");
  await startAgentChild(t, home, "mixed", 400);

  const replies = await eventually(() => talk.replies(), (found) => found.length === 2, { what: "scout to tell the person what maya said", timeoutMs: PATIENT });
  assert.ok(replies[1]?.text.includes("Stanza 2."), `the answer reached the model, and the reply that followed it:\n${replies[1]?.text}`);
  await talk.untilIdle();
  assert.equal((await talk.replies()).length, 2, "and nothing came twice");
  assert.equal(loggedRequests(home).length, 3, "the two requests of the turn that asked, and one for the answer");
  assert.equal((await dm.messages()).length, 2, "scout posted the question and nothing else in the DM");
});

test("a person can't be asked, and a sixth open question of a session is refused, each with words that say so and without posting anything", { timeout }, async (t) => {
  const asks = Array.from({ length: 5 }, (_, number) => ({ name: "ask_agent", args: { to: "@maya", text: `Question ${String(number)}?` } }));
  const person = { name: "ask_agent", args: { to: `@${userInfo().username}`, text: "Is it Tuesday?" } };
  const sixth = { name: "ask_agent", args: { to: "@maya", text: "One question too many?" } };
  const model = callingTools([[person, ...asks, sixth]]);
  const scout = await startAgentRig(t, { script: model.script });
  const maya = await scout.chat.agent("maya");

  await scout.receiptOn(await scout.say("Ask a lot of questions."));

  assert.deepEqual(model.answers.map((each) => each.isError), [true, false, false, false, false, false, true]);
  assert.ok(model.answers[0]?.text.includes("send_message"), "a person is told what to do instead");
  assert.ok(model.answers.at(-1)?.text.includes("5"), "the sixth is told how many are open");
  const dm = await dmOf(maya, "scout");
  assert.deepEqual((await dm.messages()).map((message) => message.text), asks.map((ask) => ask.args.text), "only the five were posted");
  assert.deepEqual((await scout.replies()).map((reply) => reply.text), ["Done."], "and nothing was posted to the person");
  assert.deepEqual(scout.reports, []);
});
