import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { startAgent } from "./index.ts";
import {
  answered,
  assistantItems,
  attachMain,
  type FauxScenario,
  fauxModels,
  loggedRequests,
  stopAfter,
  toolItems,
  waitForView,
} from "./testing/index.ts";

const timeout = 30_000;

function tempHome(): string {
  return mkdtempSync(join(tmpdir(), "shrimpy-stop-"));
}

async function startOn(t: TestContext, home: string, scenario: FauxScenario, tokensPerSecond?: number) {
  return stopAfter(t, await startAgent({ home, ...fauxModels({ home, scenario, tokensPerSecond }) }));
}

/** Attach to the home's agent for the rest of the test. The agent may be gone before the connection is closed. */
async function attach(t: TestContext, home: string) {
  const attached = await attachMain(home);
  t.after(() => attached.connection.close().catch(() => undefined));
  return attached;
}

/** Steer a long answer, and return once part of it has streamed. */
async function startStreaming(t: TestContext, home: string, tokensPerSecond: number) {
  const agent = await startOn(t, home, "stream", tokensPerSecond);
  const attached = await attach(t, home);
  const { submission } = await attached.session.steer("stream a long answer", "request-1");
  await waitForView(attached.session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 60);
  return { agent, submission, ...attached };
}

/** Start another agent on the home, and return the main session's view once it has answered. */
async function resumed(t: TestContext, home: string, scenario: FauxScenario, tokensPerSecond: number) {
  const agent = await startOn(t, home, scenario, tokensPerSecond);
  const { connection, session } = await attach(t, home);
  const view = await waitForView(session, answered);
  await connection.close();
  await agent.close();
  return view;
}

test("stopping lets a running turn finish first", { timeout }, async (t) => {
  const home = tempHome();
  const { agent } = await startStreaming(t, home, 400);

  await agent.close();

  const view = await resumed(t, home, "stream", 4000);
  assert.deepEqual(
    view.items.map((item) => item.type),
    ["user", "assistant"],
  );
  assert.equal(assistantItems(view)[0]?.stopReason, "stop");
  // The turn was answered before the agent stopped, so nothing was asked twice.
  assert.equal(loggedRequests(home).length, 1);
});

test("stopping at once pauses the turn, and the next start finishes it", { timeout }, async (t) => {
  const home = tempHome();
  const { agent } = await startStreaming(t, home, 40);

  const started = Date.now();
  await agent.close({ now: true });
  assert.ok(Date.now() - started < 3000, "stopped without waiting for the answer");

  const view = await resumed(t, home, "stream", 4000);
  assert.deepEqual(
    view.items.map((item) => item.type),
    ["user", "assistant", "assistant"],
  );
  const [partial, complete] = assistantItems(view);
  assert.equal(partial?.stopReason, "aborted");
  assert.ok(partial.text.startsWith("line 01"));
  assert.ok(complete?.text.endsWith("line 40: the quick brown fox jumps over the lazy dog"));
  const sent = loggedRequests(home);
  assert.equal(sent.length, 2);
  assert.equal(sent[0]?.digest, sent[1]?.digest);
});

test("a turn that outlasts the grace period is paused, not lost", { timeout }, async (t) => {
  const home = tempHome();
  const { agent } = await startStreaming(t, home, 40);

  const started = Date.now();
  await agent.close({ graceMs: 300 });
  const waited = Date.now() - started;
  assert.ok(waited >= 250 && waited < 3000, `waited ${waited} ms`);

  const view = await resumed(t, home, "stream", 4000);
  assert.equal(assistantItems(view).at(-1)?.stopReason, "stop");
  assert.equal(loggedRequests(home).length, 2);
});

test("input accepted before the stop is answered after the next start, and can be waited for then", { timeout }, async (t) => {
  const home = tempHome();
  const { agent, session, submission: first } = await startStreaming(t, home, 40);
  const { submission: second } = await session.steer("and a second one", "request-2");
  assert.notEqual(first, second);

  await agent.close({ now: true });

  await startOn(t, home, "stream", 4000);
  const restarted = await attach(t, home);
  const settled = await Promise.all([restarted.session.wait(first), restarted.session.wait(second)]);
  assert.deepEqual(
    settled.map((settlement) => settlement.status),
    ["answered", "answered"],
  );
  const view = await waitForView(restarted.session, answered);
  assert.equal(view.items.filter((item) => item.type === "user").length, 2);
});

test("once stopping begins, new input is refused and the reason reaches the client", { timeout }, async (t) => {
  const home = tempHome();
  const { agent, session } = await startStreaming(t, home, 40);

  const closing = agent.close({ graceMs: 60_000 });
  await assert.rejects(session.steer("one more thing"), /The agent is stopping and is not taking new input/);

  // Asking again with `now` ends the wait.
  await agent.close({ now: true });
  await closing;
});

test("stopping twice stops once, and frees the home", { timeout }, async (t) => {
  const home = tempHome();
  const agent = await startOn(t, home, "chat");

  await Promise.all([agent.close(), agent.close(), agent.close({ now: true })]);
  await agent.close();

  await (await startOn(t, home, "chat")).close();
});

test("stopping during a shell command ends the command, and the next start reports it as interrupted", { timeout }, async (t) => {
  const home = tempHome();
  const agent = await startOn(t, home, "tool", 400);
  const { session } = await attach(t, home);
  await session.steer("run the slow command", "request-1");
  await waitForView(session, (view) => toolItems(view)[0]?.output.includes("started") ?? false);
  const shell = Number(readFileSync(join(home, "child.pid"), "utf8").trim());

  await agent.close({ now: true });

  // The command was running in a shell of its own; stopping the agent took it down too.
  await eventuallyGone(shell);
  assert.equal(existsSync(join(home, "runs.log")) && readFileSync(join(home, "runs.log"), "utf8").includes("finished"), false);

  const view = await resumed(t, home, "tool", 400);
  assert.equal(toolItems(view)[0]?.status, "interrupted");
  assert.equal(readFileSync(join(home, "runs.log"), "utf8").split("\n").filter((line) => line === "attempt").length, 1);
});

/** Nothing is left running in the process group that `leader` started, within a moment. */
async function eventuallyGone(leader: number): Promise<void> {
  for (let waited = 0; waited < 3000; waited += 50) {
    try {
      process.kill(-leader, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  process.kill(-leader, "SIGKILL");
  assert.fail(`the shell command was still running 3 seconds after the agent stopped`);
}
