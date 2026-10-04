import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { type StandInChat, startStandInChat } from "../contracts/chat/testing/index.ts";
import { eventually, stopAfter, tempDir, until, useRuntimeDir, waitForView } from "../lib/testing/index.ts";
import {
  answered,
  assistantItems,
  attachThread,
  loggedRequests,
  releaseGate,
  scout,
  startAgentChild,
  toolItems,
  zach,
} from "./testing/index.ts";

const timeout = 60_000;
const LAST_LINE = "line 40: the quick brown fox jumps over the lazy dog";

/** A home, a stand-in chat with Zach's DM with Scout in it, and the thread to talk in. */
function setUp(t: TestContext) {
  useRuntimeDir(t);
  const home = tempDir(t, "crash");
  return startStandInChat(t).then((chat) => ({ home, chat, thread: chat.chat.dm(zach, scout).thread }));
}

/** Start an agent in a process of its own, and wait until it is reading chat's feed, which is where it takes its place. */
async function startChild(
  t: TestContext,
  parts: { home: string; chat: StandInChat },
  scenario: Parameters<typeof startAgentChild>[2],
  tokensPerSecond: number,
) {
  const reading = parts.chat.chat.calls("feed");
  const child = await startAgentChild(t, parts.home, scenario, tokensPerSecond, parts.chat.endpoint);
  await eventually(() => parts.chat.chat.calls("feed"), (calls) => calls > reading, { what: "the agent to read the feed" });
  return child;
}

const receipt = (chat: StandInChat, id: string) =>
  eventually(
    () => chat.chat.messages().find((message) => message.id === id)?.receipts[0],
    (found) => found !== undefined,
    { what: "a receipt" },
  );

test("killed while the model streams: the request is sent again, and the reply is posted once", { timeout }, async (t) => {
  const parts = await setUp(t);
  const first = await startChild(t, parts, "mixed", 40);
  const asked = parts.chat.chat.say(zach, parts.thread.id, "stream a long answer");
  await until(() => parts.chat.chat.working(parts.thread.id).length === 1, "the agent to take the message up");
  const before = await attachThread(parts.home, parts.thread.id);
  await waitForView(before.session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) >= 60);
  await first.kill("SIGKILL");
  await before.connection.close().catch(() => undefined);
  await until(() => parts.chat.chat.working(parts.thread.id).length === 0, "the agent that died to stop looking busy");

  await startChild(t, parts, "mixed", 4000);
  assert.equal((await receipt(parts.chat, asked.id))?.status, "answered");
  const after = await attachThread(parts.home, parts.thread.id);
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
  const sent = loggedRequests(parts.home);
  assert.equal(sent.length, 2);
  assert.notEqual(sent[0]?.pid, sent[1]?.pid);
  assert.equal(sent[0]?.digest, sent[1]?.digest);
  const replies = parts.chat.chat.messages(parts.thread.id).filter((message) => message.author.id === scout.id);
  assert.deepEqual(
    replies.map((reply) => reply.text),
    [complete.text],
  );
});

test("killed while a tool runs: the tool is reported and not run again, and the reply is posted once", { timeout }, async (t) => {
  const parts = await setUp(t);
  stopAfter(t, () => stopOrphanedShell(parts.home));
  const first = await startChild(t, parts, "mixed", 400);
  const asked = parts.chat.chat.say(zach, parts.thread.id, "run the slow command");
  await until(() => parts.chat.chat.working(parts.thread.id).length === 1, "the agent to take the message up");
  const before = await attachThread(parts.home, parts.thread.id);
  await waitForView(before.session, (view) => {
    const tool = toolItems(view)[0];
    return tool?.status === "running" && tool.output.includes("started");
  });
  await first.kill("SIGKILL");
  await before.connection.close().catch(() => undefined);

  await startChild(t, parts, "mixed", 400);
  assert.equal((await receipt(parts.chat, asked.id))?.status, "answered");
  const after = await attachThread(parts.home, parts.thread.id);
  const view = await waitForView(after.session, answered);
  await after.connection.close();

  const tool = toolItems(view)[0];
  assert.equal(tool?.status, "interrupted");
  assert.equal(tool.output, "started");
  const replies = parts.chat.chat.messages(parts.thread.id).filter((message) => message.author.id === scout.id);
  assert.equal(replies.length, 1);
  assert.ok(replies[0]?.text.includes("isError=true"));
  const attempts = readFileSync(join(parts.home, "runs.log"), "utf8")
    .split("\n")
    .filter((line) => line === "attempt");
  assert.equal(attempts.length, 1);
});

test("killed between the turn ending and the reply being posted: the reply arrives once when the agent is back", { timeout }, async (t) => {
  const parts = await setUp(t);
  const first = await startChild(t, parts, "gated", 400);
  const asked = parts.chat.chat.say(zach, parts.thread.id, "hello");
  await until(() => parts.chat.chat.working(parts.thread.id).length === 1, "the agent to take the message up");
  await parts.chat.outage();
  releaseGate(parts.home);
  const before = await attachThread(parts.home, parts.thread.id);
  await waitForView(before.session, answered);
  await before.connection.close();
  assert.deepEqual(parts.chat.chat.messages(parts.thread.id).filter((message) => message.author.id === scout.id), []);
  await first.kill("SIGKILL");
  await parts.chat.recover();

  await startChild(t, parts, "gated", 400);

  assert.equal((await receipt(parts.chat, asked.id))?.status, "answered");
  const replies = parts.chat.chat.messages(parts.thread.id).filter((message) => message.author.id === scout.id);
  assert.equal(replies.length, 1);
  assert.match(replies[0]?.text ?? "", /^You said: Zach wrote at /);
  assert.equal(loggedRequests(parts.home).length, 1, "the model was not asked again");
});

test("killed while the receipt is being left: the reply is not posted a second time", { timeout }, async (t) => {
  const parts = await setUp(t);
  const held = parts.chat.chat.hold("leaveReceipt");
  const first = await startChild(t, parts, "mixed", 400);
  const asked = parts.chat.chat.say(zach, parts.thread.id, "hello");
  await eventually(() => held.arrived(), (arrived) => arrived === 1, { what: "the receipt call to arrive" });
  const posted = parts.chat.chat.messages(parts.thread.id).filter((message) => message.author.id === scout.id);
  assert.equal(posted.length, 1, "the reply is out, and the receipt is on its way");
  await first.kill("SIGKILL");
  held.release();
  assert.deepEqual(parts.chat.chat.messages().find((message) => message.id === asked.id)?.receipts, []);

  await startChild(t, parts, "mixed", 400);

  const left = await receipt(parts.chat, asked.id);
  assert.deepEqual([left?.status, left?.reply], ["answered", posted[0]?.id]);
  assert.equal(
    parts.chat.chat.messages(parts.thread.id).filter((message) => message.author.id === scout.id).length,
    1,
  );
});

test("killed with a message waiting: the next start works through what it left, in order", { timeout }, async (t) => {
  const parts = await setUp(t);
  const first = await startChild(t, parts, "mixed", 40);
  const one = parts.chat.chat.say(zach, parts.thread.id, "stream a long answer");
  await until(() => parts.chat.chat.working(parts.thread.id).length === 1, "the agent to take the message up");
  const two = parts.chat.chat.say(zach, parts.thread.id, "and then this");
  const watching = await attachThread(parts.home, parts.thread.id);
  await waitForView(watching.session, (view) => view.status.queued.length === 1);
  await watching.connection.close();
  await first.kill("SIGKILL");

  await startChild(t, parts, "mixed", 4000);

  assert.equal((await receipt(parts.chat, one.id))?.status, "answered");
  assert.equal((await receipt(parts.chat, two.id))?.status, "answered");
  const replies = parts.chat.chat.messages(parts.thread.id).filter((message) => message.author.id === scout.id);
  assert.equal(replies.length, 2);
  assert.ok(replies[0]?.text.endsWith(LAST_LINE));
  assert.match(replies[1]?.text ?? "", /and then this/);
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
