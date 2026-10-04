import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { until, waitForView } from "../lib/testing/index.ts";
import {
  answered,
  assistantItems,
  type AgentRig,
  loggedRequests,
  releaseGate,
  startAgentRig,
  toolItems,
} from "./testing/index.ts";

const timeout = 30_000;

/** An agent that has been asked for a long answer and has started to stream it. */
async function startStreaming(t: TestContext, tokensPerSecond: number) {
  const rig = await startAgentRig(t, { tokensPerSecond });
  const asked = rig.say("stream a long answer");
  await until(() => rig.chat.chat.working(rig.thread.id).length === 1, "the agent to take the message up");
  const attached = await rig.attach();
  await waitForView(attached.session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 60);
  return { rig, asked, ...attached };
}

/** Start another agent on the first one's home and chat, as the next start would. */
function restart(t: TestContext, rig: AgentRig, tokensPerSecond = 4000) {
  return startAgentRig(t, { home: rig.home, chat: rig.chat, tokensPerSecond });
}

const LAST_LINE = "line 40: the quick brown fox jumps over the lazy dog";

test("stopping lets a running turn finish first, and its reply is posted before the agent is gone", { timeout }, async (t) => {
  const { rig, asked } = await startStreaming(t, 400);

  await rig.agent.close();

  assert.equal(rig.replies().length, 1, "posted while the agent was stopping");
  assert.ok(rig.replies()[0]?.text.endsWith(LAST_LINE));
  assert.equal((await rig.receiptOn(asked)).status, "answered");
  const next = await restart(t, rig);
  await delay(100);
  assert.equal(next.replies().length, 1, "and nothing is posted again by the next start");
  assert.equal(loggedRequests(rig.home).length, 1, "or asked of the model again");
});

test("stopping at once pauses the turn, and the next start finishes it and posts the reply", { timeout }, async (t) => {
  const { rig, asked } = await startStreaming(t, 40);

  const started = Date.now();
  await rig.agent.close({ now: true });
  assert.ok(Date.now() - started < 3000, "stopped without waiting for the answer");
  assert.deepEqual(rig.replies(), [], "and nothing was posted");

  const next = await restart(t, rig);
  const receipt = await next.receiptOn(asked);

  assert.equal(receipt.status, "answered");
  assert.equal(next.replies().length, 1);
  assert.ok(next.replies()[0]?.text.endsWith(LAST_LINE));
  const { session } = await next.attach();
  const view = await waitForView(session, answered);
  assert.deepEqual(
    view.items.map((item) => item.type),
    ["user", "assistant", "assistant"],
  );
  const [partial, complete] = assistantItems(view);
  assert.equal(partial?.stopReason, "aborted");
  assert.ok(partial.text.startsWith("line 01"));
  assert.ok(complete?.text.endsWith(LAST_LINE));
  const sent = loggedRequests(rig.home);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]?.digest, sent[1]?.digest);
});

test("a turn that outlasts the grace period is paused, not lost", { timeout }, async (t) => {
  const { rig, asked } = await startStreaming(t, 40);

  const started = Date.now();
  await rig.agent.close({ graceMs: 300 });
  const waited = Date.now() - started;
  assert.ok(waited >= 250 && waited < 3000, `waited ${waited} ms`);

  const next = await restart(t, rig);
  assert.equal((await next.receiptOn(asked)).status, "answered");
  assert.equal(next.replies().length, 1);
  assert.equal(loggedRequests(rig.home).length, 2);
});

test("messages taken before the stop are answered after the next start, one reply each", { timeout }, async (t) => {
  const { rig, asked: first, session } = await startStreaming(t, 40);
  const second = rig.say("and a second one");
  await waitForView(session, (view) => view.status.queued.length === 1);

  await rig.agent.close({ now: true });

  const next = await restart(t, rig);
  assert.equal((await next.receiptOn(first)).status, "answered");
  assert.equal((await next.receiptOn(second)).status, "answered");
  assert.deepEqual(
    next.replies().map((reply) => reply.text.includes("\n\nZach wrote at") || reply.text.endsWith(LAST_LINE)),
    [true, true],
  );
});

test("once stopping begins, new input is refused, from a client and from chat, and chat's message waits for the next start", { timeout }, async (t) => {
  const { rig, session } = await startStreaming(t, 40);

  const closing = rig.agent.close({ graceMs: 60_000 });
  await assert.rejects(session.steer("one more thing"), {
    code: "service_not_allowed",
    message: "The agent is stopping and is not taking new input.",
  });
  const late = rig.say("said while the agent was stopping");
  await delay(150);
  assert.equal(rig.chat.chat.messages().find((message) => message.id === late.id)?.receipts.length, 0, "not taken");

  // Asking again with `now` ends the wait.
  await rig.agent.close({ now: true });
  await closing;
  const next = await restart(t, rig);
  assert.equal((await next.receiptOn(late)).status, "answered");
});

test("stopping twice stops once, and frees the home", { timeout }, async (t) => {
  const rig = await startAgentRig(t);

  await Promise.all([rig.agent.close(), rig.agent.close(), rig.agent.close({ now: true })]);
  await rig.agent.close();

  const next = await restart(t, rig);
  await next.agent.close();
});

test("stopping while chat is unreachable does not wait for it", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { scenario: "gated" });
  const asked = rig.say("hello");
  await until(() => rig.chat.chat.working(rig.thread.id).length === 1, "the agent to take the message up");
  await rig.chat.outage();
  releaseGate(rig.home);
  await delay(300);

  const started = Date.now();
  await rig.agent.close();

  assert.ok(Date.now() - started < 2000, `stopping took ${Date.now() - started} ms`);
  await rig.chat.recover();
  const next = await restart(t, rig);
  assert.equal((await next.receiptOn(asked)).status, "answered");
  assert.equal(next.replies().length, 1);
});

test("stopping during a shell command ends the command, and the next start reports it as interrupted", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 400 });
  const asked = rig.say("run the slow command");
  await until(() => existsSync(join(rig.home, "child.pid")), "the command to start");
  const shell = Number(readFileSync(join(rig.home, "child.pid"), "utf8").trim());

  await rig.agent.close({ now: true });

  // The command was running in a shell of its own; stopping the agent took it down too.
  await eventuallyGone(shell);
  assert.equal(existsSync(join(rig.home, "runs.log")) && readFileSync(join(rig.home, "runs.log"), "utf8").includes("finished"), false);

  const next = await restart(t, rig, 400);
  assert.equal((await next.receiptOn(asked)).status, "answered");
  const { session } = await next.attach();
  const view = await waitForView(session, answered);
  assert.equal(toolItems(view)[0]?.status, "interrupted");
  assert.ok(next.replies()[0]?.text.includes("isError=true"));
  assert.equal(readFileSync(join(rig.home, "runs.log"), "utf8").split("\n").filter((line) => line === "attempt").length, 1);
});

/** Nothing is left running in the process group that `leader` started, within a moment. */
async function eventuallyGone(leader: number): Promise<void> {
  for (let waited = 0; waited < 3000; waited += 50) {
    try {
      process.kill(-leader, 0);
    } catch {
      return;
    }
    await delay(50);
  }
  process.kill(-leader, "SIGKILL");
  assert.fail(`the shell command was still running 3 seconds after the agent stopped`);
}
