import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { SessionView } from "../contracts/agent/index.ts";
import { attachLocal } from "../contracts/agent/node.ts";
import { eventually, tempDir, waitForView } from "../lib/testing/index.ts";
import { answered, assistantItems, attachThread, releaseGate, startAgentRig, toolItems } from "./testing/index.ts";

const timeout = 30_000;

test("an agent has no sessions until it is talked to, then one for each thread, each with a history of its own", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  const side = await rig.newThread();
  const connection = await attachLocal(rig.home);
  t.after(() => connection.close());
  assert.deepEqual(await connection.sessions(), []);

  const one = await rig.say("only in the main thread");
  const two = await rig.say("only in the side thread", side.id);
  await rig.receiptOn(one);
  await rig.receiptOn(two);

  const threads = (await connection.sessions()).map((session) => session.threadId);
  assert.deepEqual(threads.toSorted(), [rig.thread.id, side.id].toSorted());
  const said = (view: SessionView): string[] =>
    view.items.flatMap((item) => (item.type === "user" ? [item.text.split("\n").at(-1) ?? ""] : []));
  assert.deepEqual(said((await rig.attach(rig.thread.id)).session.view), ["only in the main thread"]);
  assert.deepEqual(said((await rig.attach(side.id)).session.view), ["only in the side thread"]);
  assert.equal((await rig.replies(rig.thread.id)).length, 1);
  assert.equal((await rig.replies(side.id)).length, 1, "each reply is in the thread its message came from");
});

test("a client steers the session behind a thread, a retry with the same request ID is the same input, and a second client sees the same session", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("show me the files"));
  const { session } = await rig.attach();

  const first = await session.steer("show me the files again", "request-1");
  const retried = await session.steer("show me the files again", "request-1");
  assert.equal(retried.submission, first.submission);
  const view = await waitForView(session, (current) => answered(current) && toolItems(current).length === 2);

  assert.deepEqual(toolItems(view).map((tool) => tool.status), ["done", "done"]);
  assert.equal(view.items.filter((item) => item.type === "user").length, 2, "the retry was not a third input");
  assert.equal((await rig.replies()).length, 1, "what a client steers in is not a message, so its answer is not posted");
  const second = await attachThread(rig.home, rig.thread.id);
  t.after(() => second.connection.close());
  assert.deepEqual(second.session.view, view);
});

test("a session in the middle of a turn is listed as working, and as idle once it is answered", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { scenario: "gated" });
  const asked = await rig.say("hello");
  const connection = await attachLocal(rig.home);
  t.after(() => connection.close());

  await eventually(() => connection.sessions(), (sessions) => sessions[0]?.working === true, {
    what: "the session to be working",
  });
  releaseGate(rig.home);
  await rig.receiptOn(asked);

  await eventually(() => connection.sessions(), (sessions) => sessions[0]?.working === false, {
    what: "the session to be idle",
  });
});

test("stop stops a streaming answer and keeps what arrived, and the message is marked stopped", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 40 });
  const asked = await rig.say("stream a long answer");
  await rig.untilWorking();
  const { session } = await rig.attach();
  await waitForView(session, (view) => (assistantItems(view)[0]?.text.length ?? 0) > 20);

  await session.stop();

  const view = await waitForView(session, (current) => !current.status.busy);
  const answer = assistantItems(view).at(-1);
  assert.equal(answer?.stopReason, "aborted");
  assert.ok(answer.text.startsWith("line 01"));
  assert.equal((await rig.receiptOn(asked)).status, "stopped");
  assert.deepEqual(await rig.replies(), [], "and nothing is posted");
});

test("a client waits for an input to end, and is told how it ended", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("first"));
  const { session } = await rig.attach();

  const { submission } = await session.steer("say hello", "request-1");
  const settled = await session.wait(submission);

  assert.equal(settled.status, "answered");
  // The ending is recorded: asking again gives it back, and the answer is the one in the session.
  assert.deepEqual(await session.wait(submission), settled);
  const view = await waitForView(session, answered);
  assert.equal(assistantItems(view).at(-1)?.text, settled.text);
});

test("a client that leaves while waiting does not stop the work, or wait for it", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 200 });
  await rig.receiptOn(await rig.say("first"));
  const first = await rig.attach();
  const second = await rig.attach();

  const { submission } = await first.session.steer("stream a long answer");
  const abandoned = assert.rejects(first.session.wait(submission), /Client is disposed/);
  await waitForView(first.session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 20);

  const started = Date.now();
  await first.connection.close();
  const left = Date.now() - started;
  await abandoned;

  assert.ok(left < 500, `leaving took ${left} ms, as long as the answer would have`);
  const settled = await second.session.wait(submission);
  assert.equal(settled.status, "answered");
  assert.ok(settled.text.endsWith("line 40: the quick brown fox jumps over the lazy dog"));
});

test("a thread the agent has no session for yet is refused, and the connection is still good", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("first"));
  const connection = await attachLocal(rig.home);
  t.after(() => connection.close());

  await assert.rejects(connection.attach("th_nothing"), { code: "service_invalid_value" });
  // The sessions are looked up by the thread's ID, which no client-sent name may mistake for anything else.
  await assert.rejects(attachThread(rig.home, "constructor"), { code: "service_invalid_value" });
  assert.equal((await connection.attach(rig.thread.id)).threadId, rig.thread.id);
});

test("a file of the home that can't be used is left out and reported when the agent starts, and the agent starts anyway", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  mkdirSync(join(home, "skills", "broken"), { recursive: true });
  writeFileSync(join(home, "skills", "broken", "SKILL.md"), "# no front matter\n");

  const rig = await startAgentRig(t, { home });

  assert.equal(rig.reports.length, 1);
  assert.match((rig.reports[0] as Error).message, /^skills\/broken\/SKILL\.md was left out/);
  await rig.receiptOn(await rig.say("hello"));
});
