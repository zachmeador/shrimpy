import assert from "node:assert/strict";
import { renameSync } from "node:fs";
import { test } from "node:test";
import type { Channel, Member, Message, Thread } from "../contracts/chat/index.ts";
import type { Entered } from "../contracts/chat/testing/index.ts";
import { eventually } from "../lib/testing/index.ts";
import { homePaths } from "./home/index.ts";
import { type ChatServer, loggedRequests, startAgentRig, talking } from "./testing/index.ts";

/*
 * Agents in a room, with the real engine under them and the real chat server.
 * The model of each is scripted, and says what it was shown. Members that are
 * not under test come in as agents of their own, and the test plays their side.
 */

const timeout = 60_000;

/** A room that the person who runs the gateway makes, with `members`, and its main thread. */
async function roomWith(chat: ChatServer, name: string, members: Member[]): Promise<{ person: Entered; room: Channel; main: Thread }> {
  const person = await chat.person();
  const room = await person.chat.createRoom(
    name,
    members.map((member) => member.id),
  );
  const main = (await person.chat.threads(room.id)).find((thread) => thread.main);
  assert.ok(main);
  return { person, room, main };
}

/** The messages of a thread as `viewer` sees them, once `ready` is satisfied by them. */
function messagesWhen(viewer: Entered, threadId: string, ready: (messages: Message[]) => boolean, what: string): Promise<Message[]> {
  return eventually(() => viewer.chat.read(threadId, null, 200), ready, { what, timeoutMs: 30_000 });
}

/** Resolve once nobody is working in a thread of `channelId`. */
async function untilQuiet(viewer: Entered, channelId: string, threadId: string): Promise<void> {
  await eventually(
    async () => (await viewer.chat.threads(channelId)).find((thread) => thread.id === threadId)?.working.length ?? 0,
    (working) => working === 0,
    { what: "the agents to stop working in the thread", timeoutMs: 30_000 },
  );
}

/** Answer a message in `member`'s name, as an agent does when its turn ends: post the reply, then leave a receipt on each event it answers. */
async function answer(member: Entered, threadId: string, text: string, events: string[], requestId: string): Promise<Message> {
  const reply = await member.chat.post(threadId, text, requestId);
  await member.chat.leaveReceipt(events, { status: "answered", reply: reply.id, detail: null });
  return reply;
}

test("an agent that mentioned another is woken by the answer, once, though it doesn't mention the agent, and its reply wakes nobody", { timeout }, async (t) => {
  const asking = talking((_shown, turn) =>
    turn === 0
      ? { send: { to: "#Ops", text: "@bob, which stanza will you take?" }, final: "I asked bob in the room." }
      : { final: "Thanks, stanza 2 is yours." },
  );
  const answering = talking(() => ({ final: "Stanza 2." }));
  const scout = await startAgentRig(t, { script: asking.script });
  const bob = await startAgentRig(t, { name: "bob", chat: scout.chat, script: answering.script });
  const { person, main } = await roomWith(scout.chat, "Ops", [scout.partner, bob.partner]);

  await scout.say("Ask bob in #Ops which stanza he takes.");

  const [question, reply] = await messagesWhen(person, main.id, (messages) => messages.length >= 2, "the question and bob's answer");
  assert.ok(question && reply);
  assert.deepEqual([question.author.id, reply.author.id, reply.addressed], [scout.partner.id, bob.partner.id, []], "bob answered without mentioning scout");
  assert.equal((await scout.receiptOn(reply)).status, "answered");
  const thanks = (await person.chat.read(main.id, null, 10)).find((message) => message.text === "Thanks, stanza 2 is yours.");
  assert.ok(thanks);
  assert.deepEqual(thanks.addressed, [], "the reply to an answer is for nobody, so it wakes nobody");

  assert.equal(asking.shown.length, 2, "once for the person who asked it to, once for bob's answer");
  const shown = asking.shown[1] ?? "";
  for (const fact of ["bob answered your message", "@bob, which stanza will you take?", "Stanza 2."]) {
    assert.ok(shown.includes(fact), `${fact} reached the model in\n${shown}`);
  }
  assert.equal(answering.shown.length, 1, "and bob was not woken again");
  assert.deepEqual(scout.reports, []);
});

test("in a DM an answer is taken up once: the reply wakes the agent, and the receipt that points to it does not wake it again", { timeout }, async (t) => {
  const asking = talking((_shown, turn) =>
    turn === 0 ? { send: { to: "@bob", text: "Which stanza will you take?" }, final: "I asked bob." } : { final: "Noted." },
  );
  const scout = await startAgentRig(t, { script: asking.script });
  const bob = await scout.chat.agent("bob");

  await scout.say("Ask bob which stanza he takes.");

  const [channel] = await eventually(() => bob.chat.channels(), (channels) => channels.length > 0, { what: "scout's DM with bob" });
  assert.ok(channel);
  const [dm] = await bob.chat.threads(channel.id);
  assert.ok(dm);
  const [question] = await messagesWhen(bob, dm.id, (messages) => messages.length > 0, "scout's question");
  assert.ok(question);
  const reply = await answer(bob, dm.id, "Stanza 2.", [question.event], "bob-1");
  assert.deepEqual(reply.addressed, [scout.partner.id], "every reply in a DM is for the other member");

  await messagesWhen(
    bob,
    dm.id,
    (messages) => messages.some((message) => message.id === reply.id && message.receipts.some((receipt) => receipt.memberId === scout.partner.id)),
    "scout's receipt on bob's reply",
  );
  await untilQuiet(bob, channel.id, dm.id);

  assert.equal(asking.shown.length, 2, "the person's message and bob's reply, and the receipt on the question woke nobody");
  assert.ok((asking.shown[1] ?? "").includes("bob wrote at"), "shown as any message in a DM is");
  assert.deepEqual(scout.reports, []);
});

test("one reply that answers two messages from two members wakes each of them that asked, and each answers the reply", { timeout }, async (t) => {
  const scoutAsks = talking((_shown, turn) =>
    turn === 0 ? { send: { to: "#Ops", text: "@bob, which key?" }, final: "Asked." } : { final: "Thanks, scout here." },
  );
  const mayaAsks = talking((_shown, turn) =>
    turn === 0 ? { send: { to: "#Ops", text: "@bob, which tempo?" }, final: "Asked." } : { final: "Thanks, maya here." },
  );
  const scout = await startAgentRig(t, { script: scoutAsks.script });
  const maya = await startAgentRig(t, { name: "maya", chat: scout.chat, script: mayaAsks.script });
  const bob = await scout.chat.agent("bob");
  const { person, main } = await roomWith(scout.chat, "Ops", [scout.partner, maya.partner, bob.me]);
  await scout.say("Ask bob in #Ops which key.");
  await maya.say("Ask bob in #Ops which tempo.");
  const [keyQuestion, tempoQuestion] = await messagesWhen(person, main.id, (messages) => messages.length >= 2, "both questions");
  assert.ok(keyQuestion && tempoQuestion);

  // Bob was busy, so one reply answers both, and both questions get the one receipt each, in one call.
  const reply = await bob.chat.post(main.id, "Key of C, tempo 90.", "bob-1");
  await bob.chat.leaveReceipt([keyQuestion.event, tempoQuestion.event], { status: "answered", reply: reply.id, detail: null });

  await Promise.all([scout.receiptOn(reply), maya.receiptOn(reply)]);
  assert.equal(scoutAsks.shown.length, 2);
  assert.equal(mayaAsks.shown.length, 2);
  assert.ok((scoutAsks.shown[1] ?? "").includes("which key?") && !(scoutAsks.shown[1] ?? "").includes("which tempo?"), "each is shown its own question");
  assert.ok((mayaAsks.shown[1] ?? "").includes("which tempo?") && !(mayaAsks.shown[1] ?? "").includes("which key?"));
  for (const shown of [scoutAsks.shown[1], mayaAsks.shown[1]]) assert.ok(shown?.includes("Key of C, tempo 90."), `the reply reached the model in\n${shown}`);
  assert.deepEqual(scout.reports, []);
  assert.deepEqual(maya.reports, []);
});

test("a fresh start passes over an answer it has dealt with, and over the rest of what it answered", { timeout }, async (t) => {
  const asking = talking((_shown, turn) =>
    turn === 0 ? { send: { to: "#Ops", text: "@bob, which stanza will you take?" }, final: "Asked." } : { final: "Thanks." },
  );
  const first = await startAgentRig(t, { script: asking.script });
  const bob = await first.chat.agent("bob");
  const { person, main } = await roomWith(first.chat, "Ops", [first.partner, bob.me]);
  await first.say("Ask bob in #Ops which stanza he takes.");
  const [question] = await messagesWhen(person, main.id, (messages) => messages.length >= 1, "scout's question");
  assert.ok(question);
  const reply = await answer(bob, main.id, "Stanza 2.", [question.event], "bob-1");
  await first.receiptOn(reply);
  await first.agent.close();
  // The agent's records are gone and the chat server's are not: it reads the log from the start.
  const { database } = homePaths(first.home);
  renameSync(database, `${database}.aside`);
  const asked = loggedRequests(first.home).length;

  const second = await startAgentRig(t, { home: first.home, chat: first.chat, script: talking(() => ({ final: "Here again." })).script });
  await second.receiptOn(await second.say("Are you there?"));

  assert.equal(loggedRequests(first.home).length - asked, 1, "the model was asked for the new message and nothing from before");
  const inRoom = (await person.chat.read(main.id, null, 20)).filter((message) => message.author.id === first.partner.id);
  assert.deepEqual(inRoom.map((message) => message.text), ["@bob, which stanza will you take?", "Thanks."], "and said nothing again in the room");
});
