import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { failureWords } from "../contracts/agent/index.ts";
import { eventually, stopAfter, tempDir, useRuntimeDir, waitForView } from "../lib/testing/index.ts";
import {
  answered,
  assistantItems,
  attachThread,
  loggedRequests,
  releaseGate,
  startAgentChild,
  startChatServer,
  talkTo,
  toolItems,
} from "./testing/index.ts";

const timeout = 60_000;
const LAST_LINE = "line 40: the quick brown fox jumps over the lazy dog";

/**
 * A home and the chat server and gateway. The person talks to the agent once it
 * has started for the first time and joined the roster.
 */
async function setUp(t: TestContext) {
  useRuntimeDir(t);
  const home = tempDir(t, "crash");
  const chat = await startChatServer(t);
  /** Start an agent in a process of its own, as the next start would. */
  const start = (
    scenario: Parameters<typeof startAgentChild>[2],
    tokensPerSecond: number,
    options: Parameters<typeof startAgentChild>[4] = {},
  ) => startAgentChild(t, home, scenario, tokensPerSecond, options);
  return { home, chat, start };
}

/** Wait until the model has been asked `count` times, which is when a turn is underway on a stream that is slow. */
const untilAsked = (home: string, count: number) =>
  eventually(() => (existsSync(join(home, "requests.jsonl")) ? loggedRequests(home).length : 0), (asked) => asked >= count, {
    what: `the model to be asked ${String(count)} time(s)`,
  });

/** Wait until the slow command has started `count` times. */
const untilAttempts = (home: string, count: number) =>
  eventually(() => attempts(home), (started) => started >= count, { what: `the slow command to start ${String(count)} time(s)` });

/** How many times the slow command has started. */
function attempts(home: string): number {
  const log = join(home, "runs.log");
  return existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((line) => line === "attempt").length : 0;
}

test("killed while the model streams: the request is sent again, and the reply is posted once", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  const first = await start("mixed", 40);
  const talk = await talkTo(chat);
  const asked = await talk.say("stream a long answer");
  await talk.untilWorking();
  const before = await attachThread(t, home, talk.thread.id);
  await waitForView(before.session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) >= 60);
  await first.kill("SIGKILL");
  await before.connection.close().catch(() => undefined);
  await talk.untilIdle();

  await start("mixed", 4000);
  assert.equal((await talk.receiptOn(asked)).status, "answered");
  const after = await attachThread(t, home, talk.thread.id);
  const view = await waitForView(after.session, answered);
  await after.connection.close();

  // What streamed is stored within a second of showing, so the partial answer was kept, as aborted, only when it was
  // stored before the kill.
  const answers = assistantItems(view);
  const complete = answers.at(-1);
  assert.ok(complete !== undefined && complete.text.endsWith(LAST_LINE));
  for (const partial of answers.slice(0, -1)) {
    assert.equal(partial.stopReason, "aborted");
    assert.ok(partial.text.startsWith("line 01"));
  }
  assert.ok(answers.length <= 2);
  const sent = loggedRequests(home);
  assert.equal(sent.length, 2);
  assert.notEqual(sent[0]?.pid, sent[1]?.pid);
  assert.equal(sent[0]?.digest, sent[1]?.digest);
  assert.deepEqual((await talk.replies()).map((reply) => reply.text), [complete.text]);
});

test("killed while a tool runs: the tool is reported and not run again, and the reply is posted once", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  stopAfter(t, () => stopOrphanedShell(home));
  const first = await start("mixed", 400);
  const talk = await talkTo(chat);
  const asked = await talk.say("run the slow command");
  await talk.untilWorking();
  const before = await attachThread(t, home, talk.thread.id);
  await waitForView(before.session, (view) => {
    const tool = toolItems(view)[0];
    return tool?.status === "running" && tool.output.includes("started");
  });
  await first.kill("SIGKILL");
  await before.connection.close().catch(() => undefined);

  await start("mixed", 400);
  assert.equal((await talk.receiptOn(asked)).status, "answered");
  const after = await attachThread(t, home, talk.thread.id);
  const view = await waitForView(after.session, answered);
  await after.connection.close();

  const tool = toolItems(view)[0];
  assert.equal(tool?.status, "interrupted");
  // Running output is stored within a second of showing, so what the result keeps of it is what was stored before the kill.
  assert.ok(["", "started"].includes(tool.output), tool.output);
  const replies = await talk.replies();
  assert.equal(replies.length, 1);
  assert.ok(replies[0]?.text.includes("isError=true"));
  assert.equal(attempts(home), 1);
});

test("killed between the turn ending and the reply being posted: the reply arrives once when the agent is back", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  const first = await start("gated", 400);
  const talk = await talkTo(chat);
  const asked = await talk.say("hello");
  await talk.untilWorking();
  await chat.outage();
  releaseGate(home);
  const before = await attachThread(t, home, talk.thread.id);
  await waitForView(before.session, answered);
  await before.connection.close();
  await first.kill("SIGKILL");
  await chat.recover();

  await start("gated", 400);

  assert.equal((await talk.receiptOn(asked)).status, "answered");
  const replies = await talk.replies();
  assert.equal(replies.length, 1);
  const reply = replies[0]?.text ?? "";
  assert.ok(reply.includes(talk.thread.id) && reply.includes(talk.thread.channelId) && reply.includes(talk.me.name), reply);
  assert.equal(loggedRequests(home).length, 1, "the model was not asked again");
});

test("killed while the receipt is being left: the reply is not posted a second time", { timeout }, async (t) => {
  const { chat, start } = await setUp(t);
  const first = await start("mixed", 400, { holdReceipts: true });
  const talk = await talkTo(chat);
  const asked = await talk.say("hello");
  await eventually(() => talk.replies(), (replies) => replies.length === 1, { what: "the reply to be out" });
  const [posted] = await talk.replies();
  assert.deepEqual((await talk.said()).find((message) => message.id === asked.id)?.receipts, [], "and its receipt on its way");
  await first.kill("SIGKILL");

  await start("mixed", 400);

  const left = await talk.receiptOn(asked);
  assert.deepEqual([left.status, left.reply], ["answered", posted?.id]);
  assert.equal((await talk.replies()).length, 1);
});

test("killed with a message waiting: the next start works through what it left, in order", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  const first = await start("mixed", 40);
  const talk = await talkTo(chat);
  const one = await talk.say("stream a long answer");
  await talk.untilWorking();
  const two = await talk.say("and then this");
  const watching = await attachThread(t, home, talk.thread.id);
  await waitForView(watching.session, (view) => view.status.queued.length === 1);
  await watching.connection.close();
  await first.kill("SIGKILL");

  await start("mixed", 4000);

  assert.equal((await talk.receiptOn(one)).status, "answered");
  assert.equal((await talk.receiptOn(two)).status, "answered");
  const replies = await talk.replies();
  assert.equal(replies.length, 2);
  assert.ok(replies[0]?.text.endsWith(LAST_LINE));
  assert.match(replies[1]?.text ?? "", /and then this/);
});

test("killed every time a turn's command runs: Pi ends the turn at its limit, and its failed receipt says so", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  stopAfter(t, () => stopOrphanedShell(home));
  let agent = await start("mixed", 400);
  const talk = await talkTo(chat);
  const asked = await talk.say("run the slow command until it finishes");
  // Each start runs the command again, since the last one came back interrupted, and the agent is killed while it runs.
  for (let kill = 1; kill <= 5; kill += 1) {
    await untilAttempts(home, kill);
    await agent.kill("SIGKILL");
    stopOrphanedShell(home);
    agent = await start("mixed", 400);
  }

  const receipt = await talk.receiptOn(asked);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.detail, failureWords("restart_limit", null));
  await talk.untilIdle();
  assert.deepEqual(await talk.replies(), []);
  const again = await talk.say("hello again");
  assert.equal((await talk.receiptOn(again)).status, "answered", "and the session takes the next message");
});

test("stopped in an orderly way twice while one turn runs: the turn is still answered once the agent is back", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  const first = await start("mixed", 40, { graceMs: 100 });
  const talk = await talkTo(chat);
  const asked = await talk.say("stream a long answer");
  await untilAsked(home, 1);
  await first.kill("SIGTERM");
  const second = await start("mixed", 40, { graceMs: 100 });
  await untilAsked(home, 2);
  await second.kill("SIGTERM");

  await start("mixed", 4000);

  assert.equal((await talk.receiptOn(asked)).status, "answered");
  assert.equal((await talk.replies()).length, 1);
});

test("killed while wake-ups wait: each still comes, once, whether it fell due while the agent was down or not", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  const first = await start("mixed", 400);
  const talk = await talkTo(chat);
  await talk.receiptOn(await talk.say("check back in 1s and 3s"));
  await first.kill("SIGKILL");
  // The first falls due while the agent is down. The second may or may not by the time it is back.
  await delay(1_200);

  await start("mixed", 400);

  const replies = await eventually(() => talk.replies(), (found) => found.length === 3, { what: "both wake-ups to be answered" });
  assert.ok(replies[1]?.text.includes("look again (1s)"));
  assert.ok(replies[2]?.text.includes("look again (3s)"));
  await talk.untilIdle();
  assert.equal((await talk.replies()).length, 3, "and nothing came twice");
  assert.equal(loggedRequests(home).length, 4, "the two requests of the turn that asked, and one for each wake-up");
});

/** The killed agent's shell command keeps running on its own; stop it so the test leaves nothing behind. */
function stopOrphanedShell(home: string): void {
  const file = join(home, "child.pid");
  if (!existsSync(file)) return;
  try {
    // The shell leads its own process group, so this also stops its `sleep`.
    process.kill(-Number(readFileSync(file, "utf8").trim()), "SIGKILL");
  } catch {
    // It already finished.
  }
}
