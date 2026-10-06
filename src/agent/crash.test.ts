import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
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

test("killed while the model streams: the request is sent again, and the reply is posted once", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  const first = await start("mixed", 40);
  const talk = await talkTo(chat);
  const asked = await talk.say("stream a long answer");
  await talk.untilWorking();
  const before = await attachThread(home, talk.thread.id);
  await waitForView(before.session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) >= 60);
  await first.kill("SIGKILL");
  await before.connection.close().catch(() => undefined);
  await talk.untilIdle();

  await start("mixed", 4000);
  assert.equal((await talk.receiptOn(asked)).status, "answered");
  const after = await attachThread(home, talk.thread.id);
  const view = await waitForView(after.session, answered);
  await after.connection.close();

  assert.deepEqual(
    view.items.map((item) => item.type),
    ["user", "assistant", "assistant"],
  );
  const [partial, complete] = assistantItems(view);
  assert.ok(partial && complete);
  assert.equal(partial.stopReason, "aborted");
  assert.ok(partial.text.startsWith("line 01"));
  assert.ok(complete.text.endsWith(LAST_LINE));
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
  const before = await attachThread(home, talk.thread.id);
  await waitForView(before.session, (view) => {
    const tool = toolItems(view)[0];
    return tool?.status === "running" && tool.output.includes("started");
  });
  await first.kill("SIGKILL");
  await before.connection.close().catch(() => undefined);

  await start("mixed", 400);
  assert.equal((await talk.receiptOn(asked)).status, "answered");
  const after = await attachThread(home, talk.thread.id);
  const view = await waitForView(after.session, answered);
  await after.connection.close();

  const tool = toolItems(view)[0];
  assert.equal(tool?.status, "interrupted");
  assert.equal(tool.output, "started");
  const replies = await talk.replies();
  assert.equal(replies.length, 1);
  assert.ok(replies[0]?.text.includes("isError=true"));
  const attempts = readFileSync(join(home, "runs.log"), "utf8")
    .split("\n")
    .filter((line) => line === "attempt");
  assert.equal(attempts.length, 1);
});

test("killed between the turn ending and the reply being posted: the reply arrives once when the agent is back", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  const first = await start("gated", 400);
  const talk = await talkTo(chat);
  const asked = await talk.say("hello");
  await talk.untilWorking();
  await chat.outage();
  releaseGate(home);
  const before = await attachThread(home, talk.thread.id);
  await waitForView(before.session, answered);
  await before.connection.close();
  await first.kill("SIGKILL");
  await chat.recover();

  await start("gated", 400);

  assert.equal((await talk.receiptOn(asked)).status, "answered");
  const replies = await talk.replies();
  assert.equal(replies.length, 1);
  assert.match(replies[0]?.text ?? "", /^You said: [^\n]*Thread th_\w+ in channel ch_\w+\.\n\n/);
  assert.ok(replies[0]?.text.includes(`${talk.me.name} wrote at `));
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
  const watching = await attachThread(home, talk.thread.id);
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

test("killed twice while one turn runs: the third start stops it, leaves a failed receipt, and does not run it again", { timeout }, async (t) => {
  const { home, chat, start } = await setUp(t);
  const first = await start("mixed", 40);
  const talk = await talkTo(chat);
  const asked = await talk.say("stream a long answer");
  await untilAsked(home, 1);
  await first.kill("SIGKILL");
  const second = await start("mixed", 40);
  await untilAsked(home, 2);
  await second.kill("SIGKILL");

  await start("mixed", 4000);

  assert.equal((await talk.receiptOn(asked)).status, "failed");
  await talk.untilIdle();
  assert.equal(loggedRequests(home).length, 2, "the model was not asked a third time");
  assert.deepEqual(await talk.replies(), []);
  const again = await talk.say("hello again");
  assert.equal((await talk.receiptOn(again)).status, "answered", "and what the receipt says to do works");
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
