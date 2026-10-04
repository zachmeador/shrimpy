import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { CommitPublication } from "@earendil-works/pi-durable";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { openHost } from "../host/index.ts";
import type { Outstanding, Snapshot } from "../intake/index.ts";
import { type FauxScenario, fauxModels, loggedRequests, releaseGate } from "../testing/index.ts";
import { createSessions } from "./index.ts";

const timeout = 30_000;
const never = new AbortController().signal;

function snapshot(n: number): Snapshot {
  return { kind: "posted", id: `evt_${String(n)}`, seq: n, author: "Zach", text: `message ${String(n)}`, sentAt: 1_700_000_000_000 + n * 1000 };
}

function draft(n: number, thread = "th_1", channel = "ch_1"): Omit<Outstanding, "earlier"> {
  return { event: snapshot(n), threadId: thread, channelId: channel };
}

/** An agent's host and sessions on `home`. They are closed when the test ends. */
async function open(t: TestContext, home: string, scenario: FauxScenario) {
  const { models, model } = fauxModels({ home, scenario, tokensPerSecond: 4000 });
  const host = await openHost({ home, models });
  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    releaseGate(home);
    await host.close();
  };
  stopAfter(t, close);
  const sessions = createSessions(host.harness, { model, cwd: home });
  await sessions.applyDefaults();
  host.resume();
  return { host, sessions, close };
}

/** Record a message, hand it over as `text`, and wait for its turn to end. */
async function run(sessions: Awaited<ReturnType<typeof open>>["sessions"], n: number, text = `hello ${String(n)}`) {
  const recorded = await sessions.turns.record(draft(n));
  assert.ok(recorded);
  const turn = await sessions.turns.start(recorded, text);
  await turn.ended(never);
  return { recorded, turn, outcome: await turn.outcome() };
}

test("recording an event makes its thread's session and writes the event to the outbox in one commit, and recording it again gives the same record", { timeout }, async (t) => {
  const { host, sessions } = await open(t, tempDir(t, "turns"), "mixed");
  const published: CommitPublication[] = [];
  host.harness.subscribeCommits((publication) => published.push(publication));

  const recorded = await sessions.turns.record(draft(1));

  assert.deepEqual(recorded, { ...draft(1), earlier: [] });
  const commits = published.filter((publication) => publication.changes.some((change) => change.type === "conversation"));
  assert.equal(commits.length, 1, "the session is made in one commit");
  const kinds = commits[0]?.changes.flatMap((change) => (change.type === "document" ? [change.record.kind] : []));
  assert.ok(kinds?.includes("shrimpy.threads") && kinds.includes("shrimpy.outbox"), `with its thread and its message: ${String(kinds)}`);
  assert.deepEqual(await sessions.turns.record(draft(1)), recorded);
  assert.deepEqual(await sessions.list(), [{ threadId: "th_1", channelId: "ch_1", working: false }]);
});

test("an event handed over is answered by its session, and handing it over again is the same input", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "mixed");
  const recorded = await sessions.turns.record(draft(1));
  assert.ok(recorded);

  const first = await sessions.turns.start(recorded, "Zach wrote:\nhello");
  const second = await sessions.turns.start(recorded, "Zach wrote:\nhello");
  await first.ended(never);
  await second.ended(never);

  const outcome = await first.outcome();
  assert.ok(outcome.kind === "answered");
  assert.deepEqual(await second.outcome(), outcome);
  assert.equal(loggedRequests(home).length, 1, "the model was asked once");
});

test("an input found waiting with nothing running, as after a restart, is taken back when it is handed over again", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "gatedFail");
  const one = await sessions.turns.record(draft(1));
  const two = await sessions.turns.record(draft(2));
  assert.ok(one && two);
  const first = await sessions.turns.start(one, "first");
  await sessions.turns.start(two, "second");
  releaseGate(home);
  await first.ended(never);

  const again = await sessions.turns.start(two, "second");

  await again.ended(never);
  assert.deepEqual(await again.outcome(), { kind: "skipped" });
});

test("an event that was settled is not recorded again, however often chat offers it", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "mixed");
  const { recorded, outcome } = await run(sessions, 1);
  await sessions.turns.settle(recorded, outcome);

  assert.equal(await sessions.turns.record(draft(1)), undefined);

  assert.deepEqual(await sessions.turns.outstanding(), []);
  assert.equal(loggedRequests(home).length, 1);
});

test("sessions, the outbox, unacted events and the cursor are all there after a restart", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const before = await open(t, home, "mixed");
  const { recorded, outcome } = await run(before.sessions, 1);
  const waiting = await before.sessions.turns.record(draft(2));
  assert.ok(waiting);
  await before.sessions.turns.settle(waiting, { kind: "skipped" });
  await before.sessions.turns.setCursor(2);
  await before.close();

  const after = await open(t, home, "mixed");

  assert.deepEqual(await after.sessions.list(), [{ threadId: "th_1", channelId: "ch_1", working: false }]);
  assert.deepEqual(await after.sessions.turns.outstanding(), [recorded]);
  assert.equal(await after.sessions.turns.cursor(), 2);
  const again = await after.sessions.turns.start(recorded, "hello 1");
  await again.ended(never);
  assert.deepEqual(await again.outcome(), outcome, "the same turn, found again");
  assert.deepEqual((await after.sessions.turns.record(draft(3)))?.earlier, [snapshot(2)]);
});
