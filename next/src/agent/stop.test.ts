import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startAgent } from "./index.ts";
import {
  answered,
  assistantItems,
  attachMain,
  type FauxScenario,
  fauxModels,
  loggedRequests,
  waitForView,
} from "./testing/index.ts";

const timeout = 30_000;

function startOn(home: string, scenario: FauxScenario, tokensPerSecond?: number) {
  return startAgent({ home, ...fauxModels({ home, scenario, tokensPerSecond }) });
}

/** Steer a long answer, and return once part of it has streamed. */
async function startStreaming(home: string, tokensPerSecond: number) {
  const agent = await startOn(home, "stream", tokensPerSecond);
  const attached = await attachMain(home);
  await attached.session.steer("stream a long answer", "request-1");
  await waitForView(attached.session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 60);
  return { agent, ...attached };
}

/** The main session's view in a new agent on the same home. */
async function resumed(home: string, tokensPerSecond: number) {
  const agent = await startOn(home, "stream", tokensPerSecond);
  const attached = await attachMain(home);
  try {
    const view = await waitForView(attached.session, answered);
    return view;
  } finally {
    await attached.connection.close();
    await agent.close();
  }
}

test("stopping lets a running turn finish first", { timeout }, async () => {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-stop-"));
  const { agent, connection } = await startStreaming(home, 400);

  await agent.close();
  await connection.close().catch(() => undefined);

  const view = await resumed(home, 4000);
  assert.deepEqual(
    view.items.map((item) => item.type),
    ["user", "assistant"],
  );
  assert.equal(assistantItems(view)[0]?.stopReason, "stop");
  // The turn was answered before the agent stopped, so nothing was asked twice.
  assert.equal(loggedRequests(home).length, 1);
});

test("stopping at once pauses the turn, and the next start finishes it", { timeout }, async () => {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-stop-"));
  const { agent, connection } = await startStreaming(home, 40);

  const started = Date.now();
  await agent.close({ now: true });
  assert.ok(Date.now() - started < 3000, "stopped without waiting for the answer");
  await connection.close().catch(() => undefined);

  const view = await resumed(home, 4000);
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

test("a turn that outlasts the grace period is paused, not lost", { timeout }, async () => {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-stop-"));
  const { agent, connection } = await startStreaming(home, 40);

  const started = Date.now();
  await agent.close({ graceMs: 300 });
  const waited = Date.now() - started;
  assert.ok(waited >= 250 && waited < 3000, `waited ${waited} ms`);
  await connection.close().catch(() => undefined);

  const view = await resumed(home, 4000);
  assert.equal(assistantItems(view).at(-1)?.stopReason, "stop");
  assert.equal(loggedRequests(home).length, 2);
});

test("once stopping begins, new input is refused and the reason reaches the client", { timeout }, async () => {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-stop-"));
  const { agent, connection, session } = await startStreaming(home, 40);

  const closing = agent.close({ graceMs: 60_000 });
  try {
    await assert.rejects(session.steer("one more thing"), /The agent is stopping and is not taking new input/);
    // Stopping the work stays possible, and asking again with `now` ends the wait.
    await agent.close({ now: true });
    await closing;
  } finally {
    await connection.close().catch(() => undefined);
  }
});

test("stopping twice stops once", { timeout }, async () => {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-stop-"));
  const agent = await startOn(home, "chat");

  await Promise.all([agent.close(), agent.close(), agent.close({ now: true })]);
  await agent.close();

  // The home is free again.
  await (await startOn(home, "chat")).close();
});
