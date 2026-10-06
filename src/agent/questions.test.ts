import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { test } from "node:test";
import { fauxAssistantMessage, type Message as ModelMessage } from "@earendil-works/pi-ai";
import { type ChatConnection, connectChat, type Message, type Thread } from "../contracts/chat/index.ts";
import type { Entered } from "../contracts/chat/testing/index.ts";
import { eventually, stopAfter, tempDir, useRuntimeDir, waitForView } from "../lib/testing/index.ts";
import {
  callingTools,
  loggedRequests,
  releaseGate,
  type Script,
  startAgentChild,
  startAgentRig,
  startChatServer,
  talking,
  talkTo,
  untilReleased,
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

/** A thread of a DM, and the messages said in it so far. */
interface DmThread {
  threadId: string;
  messages: () => Promise<Message[]>;
}

/**
 * `viewer`'s DM with `other`: its main thread, the thread a question made, found by
 * its name, which is how the question starts, and everything said in all of them.
 */
async function dmOf(viewer: Entered, other: string) {
  const [channel] = await eventually(
    async () => (await viewer.chat.channels()).filter((each) => each.kind === "dm" && each.name === other),
    (found) => found.length > 0,
    { what: `${viewer.me.name}'s DM with ${other}` },
  );
  const threads = (): Promise<Thread[]> => viewer.chat.threads(channel?.id ?? "");
  const within = (thread: Thread): DmThread => ({ threadId: thread.id, messages: () => viewer.chat.read(thread.id, null, 100) });
  return {
    async main(): Promise<DmThread> {
      const main = (await threads()).find((thread) => thread.main);
      assert.ok(main);
      return within(main);
    },
    async thread(name: string): Promise<DmThread> {
      const found = await eventually(
        async () => (await threads()).find((thread) => !thread.main && thread.name === name),
        (thread) => thread !== undefined,
        { what: `the thread called ${name} in ${viewer.me.name}'s DM with ${other}` },
      );
      assert.ok(found);
      return within(found);
    },
    async said(): Promise<Message[]> {
      const all = await Promise.all((await threads()).map((thread) => within(thread).messages()));
      return all.flat().sort((a, b) => a.seq - b.seq);
    },
  };
}

/** Answer a message in `member`'s name, as an agent does when its turn ends: post the reply, then leave a receipt on the event it answers. */
async function answer(member: Entered, threadId: string, text: string, event: string, requestId: string): Promise<Message> {
  const reply = await member.chat.post(threadId, text, requestId);
  await member.chat.leaveReceipt([event], { status: "answered", reply: reply.id, detail: null });
  return reply;
}

/** What the latest message to a model says. */
function latestUser(messages: readonly ModelMessage[]): string {
  const latest = messages.findLast((message) => message.role === "user");
  if (latest === undefined) return "";
  return typeof latest.content === "string" ? latest.content : latest.content.map((block) => (block.type === "text" ? block.text : "")).join("");
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

test("a question that gets no answer in time is told once, and an answer that comes later wakes a session behind the question's thread as any message does, but an answer whose receipt the feed has not brought when the time runs out is told as the answer, once", { timeout }, async (t) => {
  // While `held` is a promise nobody has settled, what the feed brings waits for the test.
  let held: Promise<void> = Promise.resolve();
  let release = (): void => undefined;
  const holding = (connection: ChatConnection): ChatConnection => ({
    ...connection,
    chat: {
      ...connection.chat,
      feed: async (cursor, limit, signal) => {
        const events = await connection.chat.feed(cursor, limit, signal);
        await held;
        return events;
      },
    },
  });
  const asking = talking((shown) => {
    if (shown.includes("Ask maya which stanza")) return { ask: { to: "@maya", text: "Which stanza will you take?", within: "1s" }, final: "I asked maya." };
    if (shown.includes("Ask maya which key")) return { ask: { to: "@maya", text: "And which key?", within: "1s" }, final: "I asked maya again." };
    return { final: "Noted." };
  });
  const scout = await startAgentRig(t, {
    script: asking.script,
    shortestWaitMs: 1_000,
    join: { connectChat: (options) => connectChat(options).then(holding) },
  });
  // A test that fails while it holds the feed must not leave the agent unable to stop.
  stopAfter(t, () => release());
  const maya = await scout.chat.agent("maya");

  const started = Date.now();
  await scout.receiptOn(await scout.say("Ask maya which stanza she takes."));
  await eventually(() => asking.shown.length, (count) => count === 2, { what: "scout to be told maya has not answered", timeoutMs: PATIENT });
  assert.ok(Date.now() - started >= 1_000, "not before the time was up");
  const told = asking.shown[1] ?? "";
  for (const fact of ["maya", "Which stanza will you take?"]) assert.ok(told.includes(fact), `${fact} reached the model in\n${told}`);

  // Maya answers too late. It is a message in the question's thread like any other, and the receipt she leaves on the question wakes nobody.
  const dm = await dmOf(maya, "scout");
  const first = await dm.thread("Which stanza will you take?");
  const [question] = await first.messages();
  assert.ok(question);
  await answer(maya, first.threadId, "Stanza 2.", question.event, "maya-1");
  await eventually(() => asking.shown.length, (count) => count === 3, { what: "scout to be woken in the question's thread", timeoutMs: PATIENT });
  const late = asking.shown[2] ?? "";
  assert.ok(late.includes("maya wrote at") && late.includes("Stanza 2."), `shown as any message in a DM is:\n${late}`);
  assert.deepEqual(
    (await (await scout.connect()).sessions()).map((session) => session.threadId).sort(),
    [scout.thread.id, first.threadId].sort(),
    "scout has a session behind the question's thread now",
  );

  // Maya answers in time, but scout's feed has not brought what she left when the time runs out: chat has it, and scout looks.
  await scout.receiptOn(await scout.say("Ask maya which key."));
  const next = await dm.thread("And which key?");
  const [second] = await next.messages();
  assert.ok(second);
  held = new Promise((resolve) => {
    release = resolve;
  });
  await answer(maya, next.threadId, "Stanza 3.", second.event, "maya-2");
  await eventually(() => asking.shown.length, (count) => count === 5, { what: "scout to be told maya's answer", timeoutMs: PATIENT });
  const answered = asking.shown[4] ?? "";
  for (const fact of ["And which key?", "Stanza 3."]) assert.ok(answered.includes(fact), `${fact} reached the model in\n${answered}`);
  assert.ok(!answered.includes("had not answered"), `the answer, not the lack of one:\n${answered}`);

  // The feed then reads her reply and her receipt for a question that is closed: neither tells scout again or wakes a session.
  release();
  await scout.receiptOn(await scout.say("The last word."), PATIENT);
  assert.equal(asking.shown.length, 6);
  assert.ok((asking.shown[5] ?? "").includes("The last word."));
  assert.equal(asking.shown.filter((shown) => shown.includes("And which key?")).length, 1, "scout was told once");
  assert.equal(asking.shown.filter((shown) => shown.includes("maya wrote at")).length, 1, "and only her answer that was too late woke a session of its own");
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
  const asked = await dm.thread("Which stanza will you take?");
  const [question] = await asked.messages();
  assert.ok(question);

  await first.kill("SIGKILL");
  await answer(maya, asked.threadId, "Stanza 2.", question.event, "maya-1");
  await startAgentChild(t, home, "mixed", 400);

  const replies = await eventually(() => talk.replies(), (found) => found.length === 2, { what: "scout to tell the person what maya said", timeoutMs: PATIENT });
  assert.ok(replies[1]?.text.includes("Stanza 2."), `the answer reached the model, and the reply that followed it:\n${replies[1]?.text}`);
  await talk.untilIdle();
  assert.equal((await talk.replies()).length, 2, "and nothing came twice");
  assert.equal(loggedRequests(home).length, 3, "the two requests of the turn that asked, and one for the answer");
  assert.equal((await asked.messages()).length, 2, "scout posted the question and nothing else in its thread");
  assert.deepEqual(await (await dm.main()).messages(), [], "and nothing in the DM's main thread");
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
  assert.deepEqual((await dm.said()).map((message) => message.text), asks.map((ask) => ask.args.text), "only the five were posted, each in a thread of its own");
  for (const ask of asks) assert.equal((await (await dm.thread(ask.args.text)).messages()).length, 1, `${ask.args.text} is alone in its thread`);
  assert.deepEqual((await scout.replies()).map((reply) => reply.text), ["Done."], "and nothing was posted to the person");
  assert.deepEqual(scout.reports, []);
});

test("a result that was skipped because the turn ahead of it failed is shown with the session's next input, once", { timeout }, async (t) => {
  const asking = talking((shown) =>
    shown.includes("Ask maya") ? { ask: { to: "@maya", text: "Which stanza will you take?" }, final: "I asked maya." } : { final: "Seen." },
  );
  // The turn that is asked to think it over waits until the test lets it go, and then fails.
  const script: Script = async (messages, home) => {
    if (!latestUser(messages).includes("Think it over")) return asking.script(messages, home);
    await untilReleased(home);
    return fauxAssistantMessage([], { stopReason: "error", errorMessage: "The model refused the request." });
  };
  const scout = await startAgentRig(t, { script });
  // A test that fails while the turn waits must not leave the agent unable to stop.
  stopAfter(t, () => releaseGate(scout.home));
  const maya = await scout.chat.agent("maya");
  await scout.receiptOn(await scout.say("Ask maya which stanza she takes."));
  const asked = await (await dmOf(maya, "scout")).thread("Which stanza will you take?");
  const [question] = await asked.messages();
  assert.ok(question);
  const { session } = await scout.attach();
  await scout.say("Think it over.");
  await waitForView(session, (view) => view.status.busy);

  // Maya answers while that turn runs, so the result waits behind it. The turn fails, and then nothing runs the result.
  await answer(maya, asked.threadId, "Stanza 2.", question.event, "maya-1");
  await waitForView(session, (view) => view.status.queued.length === 1);
  releaseGate(scout.home);
  await scout.untilIdle();
  assert.equal(asking.shown.length, 1, "the model has not been shown the result yet");

  await scout.receiptOn(await scout.say("Anything?"), PATIENT);
  const next = asking.shown[1] ?? "";
  assert.ok(next.includes("Anything?") && next.includes("Which stanza will you take?"), `with the message it came with:\n${next}`);
  assert.equal(next.split("Stanza 2.").length - 1, 1, `and once in it:\n${next}`);
  await scout.receiptOn(await scout.say("And now?"), PATIENT);
  assert.ok(!(asking.shown[2] ?? "").includes("Stanza 2."), "and not again after that");
  assert.deepEqual(scout.reports, []);
});

test("scout and maya each have a question open to the other, and each gets the other's answer, because each question is in a thread of its own", { timeout }, async (t) => {
  const scoutModel = talking((shown) => {
    if (shown.includes("Ask maya")) return { ask: { to: "@maya", text: "Which stanza will you take?" }, final: "I asked maya." };
    if (shown.includes("Which key are we in?")) return { final: "The key of C." };
    return { final: "Maya says stanza 2." };
  });
  const mayaModel = talking((shown) => {
    if (shown.includes("Ask scout")) return { ask: { to: "@scout", text: "Which key are we in?" }, final: "I asked scout." };
    if (shown.includes("Which stanza will you take?")) return { final: "Stanza 2." };
    return { final: "Scout says the key of C." };
  });
  // Maya holds her answer to scout's question until the test lets it go, so that scout's question is open when hers arrives.
  const mayaScript: Script = async (messages, home) => {
    if (latestUser(messages).includes("Which stanza will you take?")) await untilReleased(home);
    return mayaModel.script(messages, home);
  };
  const scout = await startAgentRig(t, { script: scoutModel.script });
  const maya = await startAgentRig(t, { name: "maya", chat: scout.chat, script: mayaScript });
  // A test that fails while maya's turn waits must not leave her unable to stop.
  stopAfter(t, () => releaseGate(maya.home));

  await scout.receiptOn(await scout.say("Ask maya which stanza she takes."), PATIENT);
  await maya.receiptOn(await maya.say("Ask scout which key we are in."), PATIENT);

  // Scout has a question open to maya, and answers hers all the same: hers is in another thread, so it is no part of scout's.
  await eventually(() => maya.replies(), (replies) => replies.length === 2, { what: "maya to be told what scout said", timeoutMs: PATIENT });
  releaseGate(maya.home);
  await eventually(() => scout.replies(), (replies) => replies.length === 2, { what: "scout to be told what maya said", timeoutMs: PATIENT });

  assert.deepEqual((await scout.replies()).map((reply) => reply.text), ["I asked maya.", "Maya says stanza 2."]);
  assert.deepEqual((await maya.replies()).map((reply) => reply.text), ["I asked scout.", "Scout says the key of C."]);
  await scout.untilIdle();
  await maya.untilIdle();
  assert.equal(scoutModel.shown.length, 3, "scout was woken by the person, by maya's question and by maya's answer");
  assert.equal(mayaModel.shown.length, 3, "and maya by the person, by scout's question and by scout's answer");
  // Each took the other's question up in a session of its own, behind the thread the question made, and none in the DM's main thread.
  const threadsWithAgents = async (rig: typeof scout): Promise<unknown[]> =>
    (await (await rig.connect()).sessions()).flatMap((session) =>
      session.place?.kind === "dm" && session.place.with.kind === "agent" ? [session.place.thread] : [],
    );
  assert.deepEqual(await threadsWithAgents(scout), [{ main: false, name: "Which key are we in?" }]);
  assert.deepEqual(await threadsWithAgents(maya), [{ main: false, name: "Which stanza will you take?" }]);
  assert.deepEqual([scout.reports, maya.reports], [[], []]);
});
