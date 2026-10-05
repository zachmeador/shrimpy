import assert from "node:assert/strict";
import { renameSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import type { Message } from "../contracts/chat/index.ts";
import type { Entered } from "../contracts/chat/testing/index.ts";
import { eventually } from "../lib/testing/index.ts";
import { localTime } from "../lib/time/index.ts";
import { homePaths } from "./home/index.ts";
import type { WakePolicy } from "./intake/index.ts";
import { loggedRequests, roomWith, startAgentRig, talking } from "./testing/index.ts";

/*
 * Agents in a room, with the real engine under them and the real chat server.
 * The model of each is scripted, and says what it was shown. Members that are
 * not under test come in as agents of their own, and the test plays their side.
 */

const timeout = 60_000;
/** How long to wait for an agent's receipt, in milliseconds: turns of several agents follow one another. */
const PATIENT = 30_000;

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
  assert.equal((await scout.receiptOn(reply, PATIENT)).status, "answered");
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

  await Promise.all([scout.receiptOn(reply, PATIENT), maya.receiptOn(reply, PATIENT)]);
  assert.equal(scoutAsks.shown.length, 2);
  assert.equal(mayaAsks.shown.length, 2);
  // Each is shown that bob answered its own question, and the reply.
  assert.ok((scoutAsks.shown[1] ?? "").includes(`bob answered your message from ${localTime(keyQuestion.sentAt)}, which starts:\n@bob, which key?`));
  assert.ok((mayaAsks.shown[1] ?? "").includes(`bob answered your message from ${localTime(tempoQuestion.sentAt)}, which starts:\n@bob, which tempo?`));
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
  await first.receiptOn(reply, PATIENT);
  await first.agent.close();
  // The agent's records are gone and the chat server's are not: it reads the log from the start.
  const { database } = homePaths(first.home);
  renameSync(database, `${database}.aside`);
  const asked = loggedRequests(first.home).length;

  const second = await startAgentRig(t, { home: first.home, chat: first.chat, script: talking(() => ({ final: "Here again." })).script });
  await second.receiptOn(await second.say("Are you there?"), PATIENT);

  assert.equal(loggedRequests(first.home).length - asked, 1, "the model was asked for the new message and nothing from before");
  const inRoom = (await person.chat.read(main.id, null, 20)).filter((message) => message.author.id === first.partner.id);
  assert.deepEqual(inRoom.map((message) => message.text), ["@bob, which stanza will you take?", "Thanks."], "and said nothing again in the room");
});

test("an agent woken in a room is shown what was said there since it last looked, then the message that woke it, and a long backlog is cut with a pointer to the rest", { timeout }, async (t) => {
  const model = talking(() => ({ final: "Seen." }));
  const scout = await startAgentRig(t, { script: model.script });
  const bob = await scout.chat.agent("bob");
  const { person, main } = await roomWith(scout.chat, "Ops", [scout.partner, bob.me]);

  // Bob talks and does not mention scout, so it is not woken until the person does.
  await bob.chat.post(main.id, "I'll take stanza 2.", "bob-1");
  await bob.chat.post(main.id, "Which key are we in?", "bob-2");
  await scout.receiptOn(await person.chat.post(main.id, "@scout, where are we?", "person-1"), PATIENT);
  const first = model.shown[0] ?? "";
  const [stanza, key, woke] = ["I'll take stanza 2.", "Which key are we in?", "@scout, where are we?"].map((text) => first.indexOf(text));
  assert.ok(first.includes("Since you last looked in this thread") && first.includes("Then this woke you:"), first);
  assert.ok(stanza !== undefined && key !== undefined && woke !== undefined && 0 < stanza && stanza < key && key < woke, `oldest first, then the message that woke it:\n${first}`);

  // What it was shown is not shown again.
  await bob.chat.post(main.id, "Never mind, it is C.", "bob-3");
  await scout.receiptOn(await person.chat.post(main.id, "@scout, and now?", "person-2"), PATIENT);
  const second = model.shown[1] ?? "";
  assert.ok(second.includes("Never mind, it is C."));
  assert.ok(!second.includes("stanza 2") && !second.includes("Which key"), second);

  // A backlog that is longer than the model is shown keeps the newest, says how many are left out and how to read them.
  for (let n = 1; n <= 30; n++) await bob.chat.post(main.id, `${String(n).padStart(2, "0")} ${"x".repeat(900)}`, `long-${String(n)}`);
  await scout.receiptOn(await person.chat.post(main.id, "@scout, catch up.", "person-3"), PATIENT);
  const third = model.shown[2] ?? "";
  assert.ok(third.length < 22_000, `${String(third.length)} characters`);
  const [, cut = "", before = ""] = /(\d+) earlier messages are not shown here\. To read them, call read_messages with before: (\d+)\./.exec(third) ?? [];
  const numbered = [...third.matchAll(/^(\d\d) x+/gm)].map((found) => Number(found[1]));
  assert.equal(numbered.at(-1), 30, "the newest is kept");
  assert.equal(numbered.length + Number(cut), 30, "and every one is either shown or counted");
  const oldest = (await person.chat.read(main.id, null, 200)).find((message) => message.text.startsWith(`${String(numbered[0]).padStart(2, "0")} x`));
  assert.equal(Number(before), oldest?.seq, "read_messages reads what is before the oldest one shown");
  assert.deepEqual(scout.reports, []);
});

test("what the model reads of a message in a room says who it was for, and in a DM it says nothing of it", { timeout }, async (t) => {
  const model = talking(() => ({ final: "Seen." }));
  const scout = await startAgentRig(t, { script: model.script });
  const bob = await scout.chat.agent("bob");
  const maya = await scout.chat.agent("maya");
  const { person, main } = await roomWith(scout.chat, "Ops", [scout.partner, bob.me, maya.me]);

  const toMaya = await bob.chat.post(main.id, "@maya, the disk is full.", "bob-1");
  const aloud = await bob.chat.post(main.id, "Thinking aloud.", "bob-2");
  const both = await person.chat.post(main.id, "@scout and @bob: is it urgent?", "person-1");
  await scout.receiptOn(both, PATIENT);
  const everyone = await person.chat.post(main.id, "@all: status, please.", "person-2");
  await scout.receiptOn(everyone, PATIENT);
  const direct = await scout.say("A word in private.");
  await scout.receiptOn(direct, PATIENT);

  const [one = "", two = "", three = ""] = model.shown;
  for (const line of [
    `bob wrote at ${localTime(toMaya.sentAt)}, for maya, not for you:\n@maya, the disk is full.`,
    `bob wrote at ${localTime(aloud.sentAt)}, mentioning nobody:\nThinking aloud.`,
    `${person.me.name} wrote at ${localTime(both.sentAt)}, for you and bob:\n@scout and @bob: is it urgent?`,
  ]) {
    assert.ok(one.includes(line), `${line}\nwas not in\n${one}`);
  }
  assert.ok(two.includes(`${person.me.name} wrote at ${localTime(everyone.sentAt)}, for everyone in the room:\n@all: status, please.`), two);
  assert.ok(!two.includes("Since you last looked"), "nothing came between the two");
  assert.equal(three.includes("Since you last looked"), false);
  assert.ok(three.trimEnd().endsWith(`${person.me.name} wrote at ${localTime(direct.sentAt)}:\nA word in private.`), `a DM's message is shown as it always was:\n${three}`);
});

test("a person's post that mentions nobody wakes every agent in the room, any other post only who it mentions, until the home's wake file says otherwise, which a reload reads", { timeout }, async (t) => {
  const model = talking(() => ({ final: "Seen." }));
  const scout = await startAgentRig(t, { script: model.script });
  const bob = await scout.chat.agent("bob");
  const { person, main } = await roomWith(scout.chat, "Ops", [scout.partner, bob.me]);
  const agent = await scout.connect();
  let posts = 0;
  const post = (who: Entered, text: string): Promise<Message> => who.chat.post(main.id, text, `post-${String(++posts)}`);
  /** The turns the room has woken the agent for. A message in the DM, which no policy touches, shows it is past what came before. */
  const roomTurns = async (): Promise<string[]> => {
    await scout.receiptOn(await scout.say("Are you still there?"), PATIENT);
    return model.shown.filter((shown) => shown.includes(`Thread ${main.id}`));
  };
  /** Choose a policy for the room in the home's file, by the room's name in another case, and tell the agent to read it. */
  const choose = async (policy: WakePolicy): Promise<{ file: string; reason: string }[]> => {
    writeFileSync(homePaths(scout.home).wake, JSON.stringify({ rooms: { ops: policy } }));
    return (await agent.reload()).leftOut;
  };

  // By default a person's post that mentions nobody wakes it, and an agent's post only when it mentions it.
  await post(bob, "Thinking aloud.");
  await post(person, "Anyone seen the disk?");
  let turns = await roomTurns();
  assert.equal(turns.length, 1);
  assert.ok(turns[0]?.includes("mentioning nobody:\nAnyone seen the disk?") && turns[0].includes("Thinking aloud."));
  // A person who names another member is talking to them: scout is not woken, and sees it when something wakes it.
  await post(person, "@bob, what do you make of the disk?");
  assert.equal((await roomTurns()).length, 1);
  await post(bob, "@scout, are you there?");
  turns = await roomTurns();
  assert.equal(turns.length, 2);
  assert.ok(turns[1]?.includes("for bob, not for you:\n@bob, what do you make of the disk?"));

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
  assert.ok(turns[3]?.includes("bob wrote at"));
  assert.deepEqual(await choose("none"), []);
  await post(person, "@scout, hello?");
  assert.equal((await roomTurns()).length, 4);

  // A file that does not check out is left out and named, and what the agent last read stays.
  writeFileSync(homePaths(scout.home).wake, "{ not json");
  const [problem, ...others] = (await agent.reload()).leftOut;
  assert.equal(problem?.file, "wake.json");
  assert.deepEqual(others, []);
  writeFileSync(homePaths(scout.home).wake, JSON.stringify({ rooms: { ops: "loud" } }));
  const [wrong] = (await agent.reload()).leftOut;
  assert.equal(wrong?.reason, 'rooms.ops must be "none", "mentions", "people" or "all", not "loud"');
  await post(person, "@scout, still there?");
  assert.equal((await roomTurns()).length, 4);
  assert.deepEqual(scout.reports, []);
});
