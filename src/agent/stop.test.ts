import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { isRefusal } from "../lib/refusal/index.ts";
import { until, waitForView, within } from "../lib/testing/index.ts";
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
  const asked = await rig.say("stream a long answer");
  await rig.untilWorking();
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

  const replies = await rig.replies();
  assert.equal(replies.length, 1, "posted while the agent was stopping");
  assert.ok(replies[0]?.text.endsWith(LAST_LINE));
  assert.equal((await rig.receiptOn(asked)).status, "answered");
  const next = await restart(t, rig);
  // The next start answers a message after whatever it had left of the turn, which is nothing.
  await next.receiptOn(await next.say("anything else?"));
  assert.equal((await next.replies()).filter((reply) => reply.text.endsWith(LAST_LINE)).length, 1, "and nothing is posted again by the next start");
  assert.equal(loggedRequests(rig.home).length, 2, "or asked of the model again: one request for each message");
});

test("stopping at once pauses the turn, even while a stop waits for it, and the next start finishes it", { timeout }, async (t) => {
  const { rig, asked } = await startStreaming(t, 40);

  // A stop that waits for the turn, then one at once: the second ends the wait, and the first with it.
  const waiting = rig.agent.close({ graceMs: 60_000 });
  await rig.agent.close({ now: true });
  await waiting;
  assert.deepEqual(await rig.replies(), [], "nothing was posted");

  const next = await restart(t, rig);
  const receipt = await next.receiptOn(asked);

  assert.equal(receipt.status, "answered");
  const replies = await next.replies();
  assert.equal(replies.length, 1);
  assert.ok(replies[0]?.text.endsWith(LAST_LINE));
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
  assert.ok(waited >= 250, `it gave the turn its grace, and waited ${waited} ms`);

  const next = await restart(t, rig);
  assert.equal((await next.receiptOn(asked)).status, "answered");
  assert.equal((await next.replies()).length, 1);
  assert.equal(loggedRequests(rig.home).length, 2);
});

test("once stopping begins new input is refused, and chat's message waits for the next start", { timeout }, async (t) => {
  // The model holds the turn at the gate until the test lets it go.
  const rig = await startAgentRig(t, { scenario: "gated" });
  await rig.say("hold on");
  await rig.untilWorking();
  const { session } = await rig.attach();

  const closing = rig.agent.close({ graceMs: 60_000 });
  await assert.rejects(session.steer("one more thing"), isRefusal);
  const late = await rig.say("said while the agent was stopping");
  // The turn ends and the agent stops by itself. Had it taken the message, it would have answered it first.
  releaseGate(rig.home);
  await closing;
  const [seen] = (await rig.said()).filter((message) => message.id === late.id);
  assert.equal(seen?.receipts.length, 0, "not taken");

  const next = await restart(t, rig);
  assert.equal((await next.receiptOn(late)).status, "answered");
});

test("stopping while chat is unreachable does not wait for it", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { scenario: "gated" });
  const asked = await rig.say("hello");
  await rig.untilWorking();
  const { session } = await rig.attach();
  await rig.chat.outage();
  releaseGate(rig.home);
  await waitForView(session, answered);

  // A stop that waited for chat would wait the minute it is given.
  await within(20_000, rig.agent.close({ graceMs: 60_000 }), "the stop, which does not wait for chat");
  await rig.chat.recover();
  const next = await restart(t, rig);
  assert.equal((await next.receiptOn(asked)).status, "answered");
  assert.equal((await next.replies()).length, 1);
});

test("stopping during a shell command ends the command, and the next start reports it as interrupted", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 400 });
  const asked = await rig.say("run the slow command");
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
  assert.ok((await next.replies())[0]?.text.includes("isError=true"));
  assert.equal(readFileSync(join(rig.home, "runs.log"), "utf8").split("\n").filter((line) => line === "attempt").length, 1);
});

/** Nothing is left running in the process group that `leader` started, within a moment. */
async function eventuallyGone(leader: number): Promise<void> {
  const gone = (): boolean => {
    try {
      process.kill(-leader, 0);
      return false;
    } catch {
      return true;
    }
  };
  try {
    await until(gone, "the shell command to end with the agent", 3000);
  } catch (error) {
    process.kill(-leader, "SIGKILL");
    throw error;
  }
}
