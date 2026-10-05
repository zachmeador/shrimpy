import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { test } from "node:test";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { Message } from "../contracts/chat/index.ts";
import { until, waitForView } from "../lib/testing/index.ts";
import { homePaths } from "./home/index.ts";
import { roomWith, SCOUT, type Script, shownSinceLastAnswer, startAgentRig } from "./testing/index.ts";

/*
 * What a person can write in a thread to make the agent do something without asking a
 * model: `/stop`. The real engine is under the agent, with the real chat server. The
 * model streams a long answer slowly, so a turn is running until something stops it.
 */

const timeout = 60_000;

/** Slow enough that a turn is still streaming when what the test says next has been read. */
const SLOWLY = 100;

const lines = (count: number): string =>
  Array.from({ length: count }, (_, line) => `line ${String(line + 1)}: the quick brown fox jumps over the lazy dog`).join("\n");

/**
 * A model that streams `text` in answer to anything, except to a message that asks for
 * it briefly, or for a short answer, and notes what each request showed it that it had
 * not been shown before.
 */
function streaming(text = lines(60)): { script: Script; asked: string[] } {
  const asked: string[] = [];
  const script: Script = (messages) => {
    const shown = shownSinceLastAnswer(messages);
    asked.push(shown);
    if (shown.includes("briefly")) return fauxAssistantMessage("Briefly.");
    return fauxAssistantMessage(shown.includes("short answer") ? lines(6) : text);
  };
  return { script, asked };
}

test("/stop in a DM stops the turn that is running there and takes back what waits behind it, and no model reads it", { timeout }, async (t) => {
  const model = streaming();
  const rig = await startAgentRig(t, { script: model.script, tokensPerSecond: SLOWLY });
  const running = await rig.say("first, a long answer");
  await until(() => model.asked.length === 1, "the model to be asked for the first turn");
  // Another thread has a turn of its own, which is shorter and not for the command to stop.
  const side = await rig.newThread("side");
  const elsewhere = await rig.say("in the side thread, a short answer", side.id);
  await until(() => model.asked.length === 2, "the model to be asked for the side thread's turn");
  const { session } = await rig.attach();
  const waiting = [await rig.say("second"), await rig.say("third")];
  await waitForView(session, (view) => view.status.queued.length === 2);

  const command = await rig.say("/stop");

  const receipts = await Promise.all([running, ...waiting, command].map((message) => rig.receiptOn(message)));
  assert.deepEqual(receipts.map((receipt) => receipt.status), ["stopped", "skipped", "skipped", "silent"]);
  await rig.untilIdle();
  assert.deepEqual(await rig.replies(), [], "nothing more is posted");
  assert.equal(model.asked.length, 2, "and the model was not asked again, for the command or for what was taken back");
  assert.equal((await rig.receiptOn(elsewhere)).status, "answered", "the other thread's turn went on to its end");

  // The agent carries on. What was taken back is shown with its next message, and the command never is.
  await rig.receiptOn(await rig.say("answer me briefly"));
  const next = model.asked.at(-1) ?? "";
  assert.ok(next.includes("second") && next.includes("third"));
  assert.ok(model.asked.every((shown) => !shown.includes("/stop")));
  assert.deepEqual(rig.reports, []);
});

test("/stop in a room stops every agent there when it mentions nobody, and only the one it names when it does", { timeout }, async (t) => {
  const scoutModel = streaming();
  const bobModel = streaming();
  const scout = await startAgentRig(t, { script: scoutModel.script, tokensPerSecond: SLOWLY });
  const bob = await startAgentRig(t, { name: "bob", chat: scout.chat, script: bobModel.script, tokensPerSecond: SLOWLY });
  const { main } = await roomWith(scout.chat, "Ops", [scout.partner, bob.partner]);
  const say = (text: string): Promise<Message> => scout.say(text, main.id);
  /** Say something that mentions nobody, which wakes both, and wait until the model has been asked about it for the `turn`th time by each. */
  const startBoth = async (text: string, turn: number): Promise<Message> => {
    const message = await say(text);
    await until(() => scoutModel.asked.length === turn && bobModel.asked.length === turn, "both agents to be at work");
    return message;
  };
  const names = new Map([
    [scout.partner.id, "scout"],
    [bob.partner.id, "bob"],
  ]);
  /** What each agent left on a message, by name. */
  const receiptsOn = async (message: Message): Promise<Record<string, string>> => {
    const found = (await scout.said(main.id)).find((candidate) => candidate.id === message.id);
    return Object.fromEntries((found?.receipts ?? []).map((receipt) => [names.get(receipt.memberId) ?? receipt.memberId, receipt.status]));
  };

  // A command that mentions nobody is for everyone in the room.
  const first = await startBoth("get started", 1);
  const everyone = await say("/stop");
  await Promise.all([first, everyone].flatMap((message) => [scout.receiptOn(message), bob.receiptOn(message)]));

  // One that mentions an agent is for that agent.
  const second = await startBoth("and again", 2);
  const onlyScout = await say("@scout /stop");
  await Promise.all([scout.receiptOn(second), scout.receiptOn(onlyScout)]);
  // Bob's turn is still going, and is stopped on its own.
  const onlyBob = await say("@bob /stop");
  await Promise.all([bob.receiptOn(second), bob.receiptOn(onlyBob)]);
  // Each agent takes the events in order, so once both have answered this they are past everything before it.
  const last = await say("@all, status? Answer briefly.");
  await Promise.all([scout.receiptOn(last), bob.receiptOn(last)]);

  assert.deepEqual(await receiptsOn(first), { scout: "stopped", bob: "stopped" });
  assert.deepEqual(await receiptsOn(everyone), { scout: "silent", bob: "silent" });
  assert.deepEqual(await receiptsOn(second), { scout: "stopped", bob: "stopped" });
  assert.deepEqual(await receiptsOn(onlyScout), { scout: "silent" }, "bob was not told to stop, and did not");
  assert.deepEqual(await receiptsOn(onlyBob), { bob: "silent" });
  assert.deepEqual([scout.reports, bob.reports], [[], []]);
});

test("a room that wakes the agent for nothing does not turn /stop away", { timeout }, async (t) => {
  const model = streaming();
  const rig = await startAgentRig(t, { script: model.script, tokensPerSecond: SLOWLY });
  const { main } = await roomWith(rig.chat, "Ops", [rig.partner]);
  const working = await rig.say("get started", main.id);
  await until(() => model.asked.length === 1, "the turn to be at work");
  writeFileSync(homePaths(rig.home).wake, JSON.stringify({ rooms: { ops: "none" } }));
  assert.deepEqual((await (await rig.connect()).reload()).leftOut, []);

  const command = await rig.say("/stop", main.id);

  assert.equal((await rig.receiptOn(working)).status, "stopped");
  assert.equal((await rig.receiptOn(command)).status, "silent");
  assert.deepEqual(rig.reports, []);
});

test("an agent's message that says /stop is only text, and stops nothing", { timeout }, async (t) => {
  const model = streaming(lines(10));
  const rig = await startAgentRig(t, { script: model.script, tokensPerSecond: 200 });
  const bob = await rig.chat.agent("bob");
  const { main } = await roomWith(rig.chat, "Ops", [rig.partner, bob.me]);
  const working = await rig.say("get started", main.id);
  await until(() => model.asked.length === 1, "the first turn to be at work");

  await bob.chat.post(main.id, "/stop", "bob-1");
  const mention = await bob.chat.post(main.id, `@${SCOUT} /stop`, "bob-2");

  assert.equal((await rig.receiptOn(working)).status, "answered", "the turn went on to its end");
  assert.equal((await rig.receiptOn(mention)).status, "answered", "and the message was answered like any other");
  assert.ok(model.asked[1]?.includes("/stop"), "it reached the model as text");
  assert.deepEqual(rig.reports, []);
});

test("/stop that the agent reads in the same page of the feed as the messages before it takes those back too", { timeout }, async (t) => {
  const first = await startAgentRig(t, { script: () => fauxAssistantMessage("Hello.") });
  await first.receiptOn(await first.say("hello"));
  await first.agent.close();
  // While the agent is down, two messages and the command come in, and are all in the first page it reads.
  const messages = [await first.say("a long answer, please"), await first.say("and another")];
  const command = await first.say("/stop");

  const model = streaming();
  const second = await startAgentRig(t, { home: first.home, chat: first.chat, script: model.script, tokensPerSecond: SLOWLY });

  const [one, other, silent] = await Promise.all([...messages, command].map((message) => second.receiptOn(message)));
  assert.ok(one?.status === "stopped" || one?.status === "skipped", `the first was ${one?.status ?? "not told"}`);
  assert.equal(other?.status, "skipped");
  assert.equal(silent?.status, "silent");
  await second.untilIdle();
  assert.deepEqual((await second.replies()).map((reply) => reply.text), ["Hello."], "nothing was answered after it");
  assert.deepEqual(second.reports, []);
});
