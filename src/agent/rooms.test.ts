import assert from "node:assert/strict";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import type { WakePolicy } from "../contracts/agent/index.ts";
import { saveWake } from "../contracts/agent/node.ts";
import type { Message } from "../contracts/chat/index.ts";
import { type Speaking, speakingAs } from "../contracts/chat/testing/index.ts";
import { eventually } from "../lib/testing/index.ts";
import { localTime } from "../lib/time/index.ts";
import { homePaths } from "./home/index.ts";
import { type Audience, written } from "./inputs/index.ts";
import {
  loggedRequests,
  roomWith,
  startAgentRig,
  talking,
} from "./testing/index.ts";

/*
 * Agents in a room, with the real engine under them and the real chat server.
 * The model of each is scripted, and says what it was shown. Members that are
 * not under test come in as agents of their own, and the test plays their side.
 */

const timeout = 60_000;
/** How long to wait for an agent's receipt, in milliseconds: turns of several agents follow one another. */
const PATIENT = 30_000;

/** The messages of a thread as `viewer` sees them, once `ready` is satisfied by them. */
function messagesWhen(viewer: Speaking, threadId: string, ready: (messages: Message[]) => boolean, what: string): Promise<Message[]> {
  return eventually(() => viewer.read(threadId, null, 200), ready, { what, timeoutMs: 30_000 });
}

/** Resolve once nobody is working in a thread of `channelId`. */
async function untilQuiet(viewer: Speaking, channelId: string, threadId: string): Promise<void> {
  await eventually(
    async () => (await viewer.threads(channelId)).find((thread) => thread.id === threadId)?.working.length ?? 0,
    (working) => working === 0,
    { what: "the agents to stop working in the thread", timeoutMs: 30_000 },
  );
}

/** Answer a message in `member`'s name, as an agent does when its turn ends: post the reply, then leave a receipt on each event it answers. */
async function answer(member: Speaking, threadId: string, text: string, events: string[], requestId: string): Promise<Message> {
  const reply = await member.post(threadId, text, requestId);
  await member.leaveReceipt(events, { status: "answered", reply: reply.id, detail: null });
  return reply;
}

test("an agent that mentioned another is woken once by the answer, though it doesn't mention the agent", { timeout }, async (t) => {
  const asking = talking((_shown, turn) =>
    turn === 0
      ? { send: { to: "#Ops", text: "@bob, which stanza will you take?" }, final: "I asked bob in the room." }
      : { final: "Thanks, stanza 2 is yours." },
  );
  const answering = talking(() => ({ final: "Stanza 2." }));
  const scout = await startAgentRig(t, { script: asking.script });
  const bob = await startAgentRig(t, { name: "bob", chat: scout.chat, script: answering.script });
  const { person, pinned } = await roomWith(t, scout.chat, "Ops", [scout.partner, bob.partner]);

  await scout.say("Ask bob in #Ops which stanza he takes.");

  const [question, reply] = await messagesWhen(person, pinned.id, (messages) => messages.length >= 2, "the question and bob's answer");
  assert.ok(question && reply);
  assert.deepEqual([question.author.id, reply.author.id, reply.mentions], [scout.partner.id, bob.partner.id, []], "bob answered without mentioning scout");
  assert.equal((await scout.receiptOn(reply, PATIENT)).status, "answered");
  const thanks = (await person.read(pinned.id, null, 10)).find((message) => message.text === "Thanks, stanza 2 is yours.");
  assert.ok(thanks);
  assert.deepEqual(thanks.mentions, [], "the reply to an answer mentions nobody, so it wakes nobody");

  assert.equal(asking.shown.length, 2, "once for the person who asked it to, once for bob's answer");
  const shown = asking.shown[1] ?? "";
  for (const fact of ["bob answered your message", "@bob, which stanza will you take?", "Stanza 2."]) {
    assert.ok(shown.includes(fact), `${fact} reached the model in\n${shown}`);
  }
  assert.equal(answering.shown.length, 1, "and bob was not woken again");
  assert.deepEqual(scout.reports, []);
});

test("in a DM an answer is taken up once, by its reply and not again by its receipt", { timeout }, async (t) => {
  const asking = talking((_shown, turn) => (turn === 0 ? { final: "Which stanza will you take?" } : { final: "Noted." }));
  const scout = await startAgentRig(t, { script: asking.script });
  const bob = await speakingAs(t, await scout.chat.agent("bob"));
  const dmChannel = await bob.openDm(scout.partner.id);
  const dm = await bob.createThread(dmChannel.id, null);

  await bob.post(dm.id, "Ready to split the stanzas?", "bob-0");
  const [question] = await messagesWhen(bob, dm.id, (messages) => messages.filter((m) => m.author.id === scout.partner.id).length >= 1, "scout's question");
  const scoutReply = (await bob.read(dm.id, null, 10)).find((m) => m.author.id === scout.partner.id);
  assert.ok(question && scoutReply);
  const reply = await answer(bob, dm.id, "Stanza 2.", [scoutReply.event], "bob-1");
  assert.deepEqual(reply.mentions, [], "a reply in a DM that names nobody mentions nobody, and wakes the agent all the same");

  await messagesWhen(
    bob,
    dm.id,
    (messages) => messages.some((message) => message.id === reply.id && message.receipts.some((receipt) => receipt.memberId === scout.partner.id)),
    "scout's receipt on bob's reply",
  );
  await untilQuiet(bob, dmChannel.id, dm.id);

  assert.equal(asking.shown.length, 2, "bob's opening and bob's reply, and the receipt on scout's question woke nobody");
  const woken = asking.shown[1] ?? "";
  assert.ok(woken.includes(written({ kind: "posted", id: reply.event, seq: reply.seq, author: "bob", sentAt: reply.sentAt, text: reply.text })), "shown as any message in a DM is");
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
  const bob = await speakingAs(t, await scout.chat.agent("bob"));
  const { person, pinned } = await roomWith(t, scout.chat, "Ops", [scout.partner, maya.partner, bob.me]);
  await scout.say("Ask bob in #Ops which key.");
  await maya.say("Ask bob in #Ops which tempo.");
  const [keyQuestion, tempoQuestion] = await messagesWhen(person, pinned.id, (messages) => messages.length >= 2, "both questions");
  assert.ok(keyQuestion && tempoQuestion);

  // Bob was busy, so one reply answers both, and both questions get the one receipt each, in one call.
  const reply = await bob.post(pinned.id, "Key of C, tempo 90.", "bob-1");
  await bob.leaveReceipt([keyQuestion.event, tempoQuestion.event], { status: "answered", reply: reply.id, detail: null });

  await Promise.all([scout.receiptOn(reply, PATIENT), maya.receiptOn(reply, PATIENT)]);
  assert.equal(scoutAsks.shown.length, 2);
  assert.equal(mayaAsks.shown.length, 2);
  // Each is shown that bob answered its own question, and the reply.
  for (const [shown = "", own] of [
    [scoutAsks.shown[1], keyQuestion],
    [mayaAsks.shown[1], tempoQuestion],
  ] as const) {
    assert.ok(shown.includes(localTime(own.sentAt)) && shown.includes(own.text), shown);
  }
  for (const shown of [scoutAsks.shown[1], mayaAsks.shown[1]]) assert.ok(shown?.includes("Key of C, tempo 90."), `the reply reached the model in\n${shown}`);
  assert.deepEqual(scout.reports, []);
  assert.deepEqual(maya.reports, []);
});

test("a fresh start passes over an answer it has dealt with, and over the rest of what it answered", { timeout }, async (t) => {
  const asking = talking((_shown, turn) =>
    turn === 0 ? { send: { to: "#Ops", text: "@bob, which stanza will you take?" }, final: "Asked." } : { final: "Thanks." },
  );
  const first = await startAgentRig(t, { script: asking.script });
  const bob = await speakingAs(t, await first.chat.agent("bob"));
  const { person, pinned } = await roomWith(t, first.chat, "Ops", [first.partner, bob.me]);
  await first.say("Ask bob in #Ops which stanza he takes.");
  const [question] = await messagesWhen(person, pinned.id, (messages) => messages.length >= 1, "scout's question");
  assert.ok(question);
  const reply = await answer(bob, pinned.id, "Stanza 2.", [question.event], "bob-1");
  await first.receiptOn(reply, PATIENT);
  await first.agent.close();
  // The agent's records are gone and the chat server's are not: it reads the log from the start.
  const { database } = homePaths(first.home);
  renameSync(database, `${database}.aside`);
  const asked = loggedRequests(first.home).length;

  const second = await startAgentRig(t, { home: first.home, chat: first.chat, script: talking(() => ({ final: "Here again." })).script });
  await second.receiptOn(await second.say("Are you there?"), PATIENT);

  assert.equal(loggedRequests(first.home).length - asked, 1, "the model was asked for the new message and nothing from before");
  const inRoom = (await person.read(pinned.id, null, 20)).filter((message) => message.author.id === first.partner.id);
  assert.deepEqual(inRoom.map((message) => message.text), ["@bob, which stanza will you take?", "Thanks."], "and said nothing again in the room");
});

test("an agent woken in a room is shown what was said since it last looked, then what woke it", { timeout }, async (t) => {
  const model = talking(() => ({ final: "Seen." }));
  const scout = await startAgentRig(t, { script: model.script });
  const bob = await speakingAs(t, await scout.chat.agent("bob"));
  const { person, pinned } = await roomWith(t, scout.chat, "Ops", [scout.partner, bob.me]);

  // Bob talks and does not mention scout, so it is not woken until the person does.
  await bob.post(pinned.id, "I'll take stanza 2.", "bob-1");
  await bob.post(pinned.id, "Which key are we in?", "bob-2");
  await scout.receiptOn(await person.post(pinned.id, "@scout, where are we?", "person-1"), PATIENT);
  const first = model.shown[0] ?? "";
  const [stanza, key, woke] = ["I'll take stanza 2.", "Which key are we in?", "@scout, where are we?"].map((text) => first.indexOf(text));
  assert.ok(stanza !== undefined && key !== undefined && woke !== undefined && 0 < stanza && stanza < key && key < woke, `oldest first, then the message that woke it:\n${first}`);

  // What it was shown is not shown again.
  await bob.post(pinned.id, "Never mind, it is C.", "bob-3");
  await scout.receiptOn(await person.post(pinned.id, "@scout, and now?", "person-2"), PATIENT);
  const second = model.shown[1] ?? "";
  assert.ok(second.includes("Never mind, it is C."));
  assert.ok(!second.includes("stanza 2") && !second.includes("Which key"), second);

  // A backlog that is longer than the model is shown keeps the newest, says how many are left out and how to read them.
  for (let n = 1; n <= 30; n++) await bob.post(pinned.id, `${String(n).padStart(2, "0")} ${"x".repeat(900)}`, `long-${String(n)}`);
  await scout.receiptOn(await person.post(pinned.id, "@scout, catch up.", "person-3"), PATIENT);
  const third = model.shown[2] ?? "";
  assert.ok(third.length < 22_000, `${String(third.length)} characters`);
  const numbered = [...third.matchAll(/^(\d\d) x+/gm)].map((found) => Number(found[1]));
  assert.equal(numbered.at(-1), 30, "the newest is kept");
  const oldest = (await person.read(pinned.id, null, 200)).find((message) => message.text.startsWith(`${String(numbered[0]).padStart(2, "0")} x`));
  assert.ok(oldest);
  // The line that says how to read the rest names read_messages' argument, and how many are left out.
  const pointer = third.split("\n").find((line) => line.includes(`before: ${String(oldest.seq)}`)) ?? "";
  assert.ok(pointer.split(/\D+/).includes(String(30 - numbered.length)), `every one is either shown or counted: ${pointer}`);
  assert.deepEqual(scout.reports, []);
});

test("what the model reads of a message in a room says who it was for, and in a DM it says nothing of it", { timeout }, async (t) => {
  const model = talking(() => ({ final: "Seen." }));
  const scout = await startAgentRig(t, { script: model.script });
  const bob = await speakingAs(t, await scout.chat.agent("bob"));
  const maya = await speakingAs(t, await scout.chat.agent("maya"));
  const { person, pinned } = await roomWith(t, scout.chat, "Ops", [scout.partner, bob.me, maya.me]);

  const toMaya = await bob.post(pinned.id, "@maya, the disk is full.", "bob-1");
  const aloud = await bob.post(pinned.id, "Thinking aloud.", "bob-2");
  const both = await person.post(pinned.id, "@scout and @bob: is it urgent?", "person-1");
  await scout.receiptOn(both, PATIENT);
  const everyone = await person.post(pinned.id, "@all: status, please.", "person-2");
  await scout.receiptOn(everyone, PATIENT);
  const direct = await scout.say("A word in private.");
  await scout.receiptOn(direct, PATIENT);

  /** A message as the model reads one that arrives, said to be for `to`, which a message in a DM is not. */
  const shown = (message: Message, author: string, to?: Audience): string =>
    written({ kind: "posted", id: message.event, seq: message.seq, author, sentAt: message.sentAt, text: message.text, ...(to === undefined ? {} : { to }) });
  const [one = "", two = "", three = ""] = model.shown;
  for (const line of [
    shown(toMaya, "bob", { you: false, others: ["maya"], everyone: false }),
    shown(aloud, "bob", { you: false, others: [], everyone: false }),
    shown(both, person.me.name, { you: true, others: ["bob"], everyone: false }),
  ]) {
    assert.ok(one.includes(line), `${line}\nwas not in\n${one}`);
  }
  assert.ok(two.includes(shown(everyone, person.me.name, { you: false, others: [], everyone: true })), two);
  assert.ok(!two.includes(aloud.text), "nothing came between the two");
  assert.ok(three.trimEnd().endsWith(shown(direct, person.me.name)), `a DM's message is shown as it always was:\n${three}`);
});

test("an input tells the model where it is, and the list of sessions says the same places", { timeout }, async (t) => {
  const model = talking(() => ({ final: "Seen." }));
  const scout = await startAgentRig(t, { script: model.script });
  const bob = await speakingAs(t, await scout.chat.agent("bob"));
  const maya = await speakingAs(t, await scout.chat.agent("maya"));
  const { person, room: ops, pinned } = await roomWith(t, scout.chat, "Ops", [scout.partner, bob.me]);
  const connection = await scout.connect();

  await scout.receiptOn(await scout.say("Hello in private."), PATIENT);
  const side = await scout.newThread("Budget");
  await scout.receiptOn(await scout.say("A side matter.", side.id), PATIENT);
  await scout.receiptOn(await person.post(pinned.id, "@scout, hello in the room.", "person-1"), PATIENT);
  await person.addMembers(ops.id, [maya.me.id]);
  await scout.receiptOn(await person.post(pinned.id, "@scout, and now?", "person-2"), PATIENT);

  // What opens each input is its first paragraph, before the message.
  const [dm = "", aside = "", room = "", later = ""] = model.shown.map((shown) => shown.split("\n\n")[0] ?? "");
  const isDm = (opening: string): boolean => /\bDM\b/.test(opening);
  assert.ok(isDm(dm) && dm.includes(person.me.name) && dm.includes(`Thread ${scout.thread.id}`), dm);
  assert.ok(isDm(aside) && aside.includes("Budget") && aside.includes(`Thread ${side.id}`), aside);
  assert.ok(room.includes("Ops") && room.includes(person.me.name) && /bob[^.]*agent/.test(room) && room.includes(`Thread ${pinned.id}`), room);
  assert.ok(!isDm(room) && !dm.includes("Ops"), "a room is not a DM");
  assert.ok(!room.includes("maya") && later.includes("maya"), `a member added to the room, and not mentioned, is named by the next input there:\n${later}`);

  const where = (await connection.sessions()).map((session) => [session.threadId, session.place]);
  const withPerson = { name: person.me.name, kind: "person" };
  assert.deepEqual(where, [
    [scout.thread.id, { kind: "dm", with: withPerson, thread: { name: null } }],
    [side.id, { kind: "dm", with: withPerson, thread: { name: "Budget" } }],
    [pinned.id, { kind: "room", room: "Ops", thread: { name: null } }],
  ]);
  assert.deepEqual(scout.reports, []);
});

test("a person's post that mentions nobody wakes every agent in a room, until agent.json says otherwise", { timeout }, async (t) => {
  const model = talking(() => ({ final: "Seen." }));
  const scout = await startAgentRig(t, { script: model.script });
  const bob = await speakingAs(t, await scout.chat.agent("bob"));
  const { person, pinned } = await roomWith(t, scout.chat, "Ops", [scout.partner, bob.me]);
  const agent = await scout.connect();
  let posts = 0;
  const post = (who: Speaking, text: string): Promise<Message> => who.post(pinned.id, text, `post-${String(++posts)}`);
  /** The turns the room has woken the agent for. A message in the DM, which no policy touches, shows it is past what came before. */
  const roomTurns = async (): Promise<string[]> => {
    await scout.receiptOn(await scout.say("Are you still there?"), PATIENT);
    return model.shown.filter((shown) => shown.includes(`Thread ${pinned.id}`));
  };
  /** Choose a policy for the room in the home's agent.json, by the room's name in another case, and tell the agent to read it. */
  const choose = async (policy: WakePolicy): Promise<{ file: string; reason: string }[]> => {
    saveWake(scout.home, "ops", policy);
    return (await agent.reload()).leftOut;
  };
  /** Write `wake` in the home's agent.json as an editor would, whatever it is. */
  const writeWake = (wake: unknown): void => {
    const { config } = homePaths(scout.home);
    writeFileSync(config, JSON.stringify({ ...(JSON.parse(readFileSync(config, "utf8")) as object), wake }));
  };

  // By default a person's post that mentions nobody wakes it, and an agent's post only when it mentions it.
  await post(bob, "Thinking aloud.");
  await post(person, "Anyone seen the disk?");
  let turns = await roomTurns();
  assert.equal(turns.length, 1);
  assert.ok(turns[0]?.includes("Anyone seen the disk?") && turns[0].includes("Thinking aloud."));
  // A person who names another member is talking to them: scout is not woken, and sees it when something wakes it.
  await post(person, "@bob, what do you make of the disk?");
  assert.equal((await roomTurns()).length, 1);
  await post(bob, "@scout, are you there?");
  turns = await roomTurns();
  assert.equal(turns.length, 2);
  assert.ok(turns[1]?.includes("@bob, what do you make of the disk?"));

  // `mentions` is the default it replaced: a person has to mention the agent too.
  assert.deepEqual(await choose("mentions"), []);
  await post(person, "Nobody in particular, this time.");
  assert.equal((await roomTurns()).length, 2);
  await post(person, "@scout, you.");
  assert.equal((await roomTurns()).length, 3);

  // `all` wakes it for an agent's post that mentions nobody, and `none` for nothing, a mention included.
  assert.deepEqual(await choose("all"), []);
  await post(bob, "Thinking aloud again.");
  turns = await roomTurns();
  assert.equal(turns.length, 4);
  assert.ok(turns[3]?.includes("Thinking aloud again."));
  assert.deepEqual(await choose("none"), []);
  await post(person, "@scout, hello?");
  assert.equal((await roomTurns()).length, 4);

  // Wake settings that don't check out are left out and named, and what the agent last read stays.
  writeWake("loud");
  const [problem, ...others] = (await agent.reload()).leftOut;
  assert.equal(problem?.file, '"wake" in agent.json');
  assert.deepEqual(others, []);
  writeWake({ ops: "loud" });
  const [wrong] = (await agent.reload()).leftOut;
  assert.equal(wrong?.reason, 'wake.ops must be "none", "mentions", "people" or "all", not "loud"');
  await post(person, "@scout, still there?");
  assert.equal((await roomTurns()).length, 4);
  assert.equal(scout.reports.length, 2, "the agent said each of the two problems, once");
});
