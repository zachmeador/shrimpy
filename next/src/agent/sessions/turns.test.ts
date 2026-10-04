import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { CommitPublication, ConversationId } from "@earendil-works/pi-durable";
import { eventually, stopAfter, tempDir, waitForView } from "../../lib/testing/index.ts";
import { openHost } from "../host/index.ts";
import type { Outstanding, Snapshot, Turn, TurnOutcome } from "../intake/index.ts";
import { type FauxScenario, fauxModels, loggedRequests, releaseGate } from "../testing/index.ts";
import { ThreadsDoc } from "./documents.ts";
import { createSessions } from "./index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;
const never = new AbortController().signal;

function snapshot(n: number, text = `message ${String(n)}`): Snapshot {
  return { id: `msg_${String(n)}`, seq: n, author: "Zach", text, sentAt: 1_700_000_000_000 + n * 1000 };
}

function draft(n: number, thread = "th_1", channel = "ch_1", text?: string): Omit<Outstanding, "earlier"> {
  return { message: snapshot(n, text), threadId: thread, channelId: channel };
}

interface Options {
  tokensPerSecond?: number;
}

/** An agent's host and sessions on `home`. They are closed when the test ends. */
async function open(t: TestContext, home: string, scenario: FauxScenario, options: Options = {}) {
  const { tokensPerSecond = 4000 } = options;
  const { models, model } = fauxModels({ home, scenario, tokensPerSecond });
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

test("recording a message makes its thread's session and writes the message to the outbox in one commit", { timeout }, async (t) => {
  const { host, sessions } = await open(t, tempDir(t, "turns"), "mixed");
  const published: CommitPublication[] = [];
  host.harness.subscribeCommits((publication) => published.push(publication));

  const recorded = await sessions.turns.record(draft(1));

  assert.deepEqual(recorded, { ...draft(1), earlier: [] });
  const commits = published.filter((publication) => publication.changes.some((change) => change.type === "conversation"));
  assert.equal(commits.length, 1, "the session is made in one commit");
  const kinds = commits[0]?.changes.flatMap((change) => (change.type === "document" ? [change.record.kind] : []));
  assert.ok(kinds?.includes("shrimpy.threads") && kinds.includes("shrimpy.outbox"), `with its thread and its message: ${String(kinds)}`);
  assert.deepEqual(await sessions.list(), [{ threadId: "th_1", channelId: "ch_1", working: false }]);
  assert.deepEqual(await sessions.turns.outstanding(), [recorded]);
});

test("recording the same message again gives the same record, and a message in another thread gets a session of its own", { timeout }, async (t) => {
  const { sessions } = await open(t, tempDir(t, "turns"), "mixed");

  const first = await sessions.turns.record(draft(1));
  const again = await sessions.turns.record(draft(1));
  await sessions.turns.record(draft(2, "th_2", "ch_2"));
  const alongside = await sessions.turns.record(draft(3));

  assert.deepEqual(again, first);
  assert.deepEqual(
    (await sessions.list()).map((session) => [session.threadId, session.channelId]),
    [
      ["th_1", "ch_1"],
      ["th_2", "ch_2"],
    ],
  );
  assert.deepEqual(
    (await sessions.turns.outstanding()).map((entry) => entry.message.id),
    ["msg_1", "msg_2", "msg_3"],
  );
  assert.deepEqual(alongside?.earlier, []);
});

test("a thread the agent has no session for is not a session, and cannot be served", { timeout }, async (t) => {
  const { sessions } = await open(t, tempDir(t, "turns"), "mixed");
  await sessions.turns.record(draft(1));

  assert.equal(await sessions.has("th_1"), true);
  assert.equal(await sessions.has("th_2"), false);
  assert.equal(await sessions.has("constructor"), false);
  assert.equal(await sessions.has("__proto__"), false);
  await assert.rejects(sessions.serve("th_2", () => true), /no session for thread th_2/);
});

test("a message handed over is answered by its session, and handing it over again is the same input", { timeout }, async (t) => {
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
  assert.match(outcome.text, /^You said: Zach wrote:\nhello\n\n- first point/);
  assert.deepEqual(await second.outcome(), outcome);
  assert.equal(loggedRequests(home).length, 1, "the model was asked once");
});

test("the session's input is queued behind work already there, and the session is working until it is answered", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "gated");
  const one = await sessions.turns.record(draft(1));
  const two = await sessions.turns.record(draft(2));
  assert.ok(one && two);

  const first = await sessions.turns.start(one, "first");
  const second = await sessions.turns.start(two, "second");
  assert.deepEqual((await sessions.list()).map((session) => session.working), [true]);
  releaseGate(home);
  await first.ended(never);
  await second.ended(never);

  await eventually(() => sessions.list(), (listed) => listed[0]?.working === false, { what: "the session to be idle" });
  const [a, b] = [await first.outcome(), await second.outcome()];
  assert.ok(a.kind === "answered" && b.kind === "answered");
  assert.notEqual(a.answer, b.answer, "two turns, two answers");
  assert.match(a.text, /first/);
  assert.match(b.text, /second/);
});

test("inputs that queued up while the session was busy are answered together, by one answer", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "gated");
  const recorded = [await sessions.turns.record(draft(1)), await sessions.turns.record(draft(2)), await sessions.turns.record(draft(3))];
  const [one, two, three] = recorded;
  assert.ok(one && two && three);

  const turns = [
    await sessions.turns.start(one, "first"),
    await sessions.turns.start(two, "second"),
    await sessions.turns.start(three, "third"),
  ];
  releaseGate(home);
  for (const turn of turns) await turn.ended(never);

  const [a, b, c] = await Promise.all(turns.map((turn) => turn.outcome()));
  assert.ok(a?.kind === "answered" && b?.kind === "answered" && c?.kind === "answered");
  assert.notEqual(a.answer, b.answer, "the first was already being answered");
  assert.equal(b.answer, c.answer, "the two that waited share an answer");
  assert.match(b.text, /third/);
});

test("nothing starts what waits behind a turn that failed, and withdrawing it ends it as skipped", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "gatedFail");
  const one = await sessions.turns.record(draft(1));
  const two = await sessions.turns.record(draft(2));
  assert.ok(one && two);
  const first = await sessions.turns.start(one, "first");
  const second = await sessions.turns.start(two, "second");
  releaseGate(home);
  await first.ended(never);
  assert.equal((await first.outcome()).kind, "failed");
  assert.deepEqual((await sessions.list()).map((session) => session.working), [true], "the second is still waiting");

  await sessions.turns.withdraw(two);

  await second.ended(never);
  assert.deepEqual(await second.outcome(), { kind: "skipped" });
  await eventually(() => sessions.list(), (listed) => listed[0]?.working === false, { what: "the session to be idle" });
});

test("withdrawing leaves a turn that is running alone", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "gated");
  const one = await sessions.turns.record(draft(1));
  assert.ok(one);
  const running = await sessions.turns.start(one, "first");

  await sessions.turns.withdraw(one);
  releaseGate(home);

  await running.ended(never);
  assert.equal((await running.outcome()).kind, "answered");
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

test("stopping a session ends the input it was working on as stopped, and withdraws what waited as skipped", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "mixed", { tokensPerSecond: 40 });
  const one = await sessions.turns.record(draft(1));
  const two = await sessions.turns.record(draft(2));
  const three = await sessions.turns.record(draft(3));
  assert.ok(one && two && three);
  const running = await sessions.turns.start(one, "stream a long answer");
  const waiting = await Promise.all([two, three].map((entry) => sessions.turns.start(entry, "and then this")));
  const served = await sessions.serve("th_1", () => true);
  await waitForView(served.service.state, (view) => {
    const last = view.items.at(-1);
    return last?.type === "assistant" && last.text.length > 20;
  });

  await served.service.stop(context);

  await running.ended(never);
  for (const turn of waiting) await turn.ended(never);
  assert.deepEqual(await running.outcome(), { kind: "stopped" });
  assert.deepEqual(await Promise.all(waiting.map((turn) => turn.outcome())), [{ kind: "skipped" }, { kind: "skipped" }]);
  served.close();
});

test("an input the model could not answer fails with the reason in words", { timeout }, async (t) => {
  const { sessions } = await open(t, tempDir(t, "turns"), "fail");

  const { outcome } = await run(sessions, 1);

  assert.deepEqual(outcome, { kind: "failed", reason: "The model failed: The model refused the request." });
});

test("settling takes a message out of the outbox, and doing it again changes nothing", { timeout }, async (t) => {
  const { sessions } = await open(t, tempDir(t, "turns"), "mixed");
  const { recorded, outcome } = await run(sessions, 1);

  await sessions.turns.settle(recorded, outcome);
  await sessions.turns.settle(recorded, outcome);

  assert.deepEqual(await sessions.turns.outstanding(), []);
});

test("a message that was settled is not recorded again, however often chat offers it", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "mixed");
  const { recorded, outcome } = await run(sessions, 1);
  await sessions.turns.settle(recorded, outcome);

  assert.equal(await sessions.turns.record(draft(1)), undefined);

  assert.deepEqual(await sessions.turns.outstanding(), []);
  assert.equal(loggedRequests(home).length, 1);
});

test("a skipped message stays unacted, and the next message in its thread is handed over with it", { timeout }, async (t) => {
  const { sessions } = await open(t, tempDir(t, "turns"), "mixed");
  const one = await sessions.turns.record(draft(1));
  const two = await sessions.turns.record(draft(2));
  assert.ok(one && two);
  const skipped: TurnOutcome = { kind: "skipped" };
  await sessions.turns.settle(two, skipped);
  await sessions.turns.settle(one, skipped);

  const three = await sessions.turns.record(draft(3));
  const elsewhere = await sessions.turns.record(draft(4, "th_9", "ch_9"));

  assert.deepEqual(three?.earlier, [snapshot(1), snapshot(2)], "oldest first, however they were settled");
  assert.deepEqual(elsewhere?.earlier, [], "and only in their own thread");
  assert.deepEqual(
    (await sessions.turns.record(draft(3)))?.earlier,
    [snapshot(1), snapshot(2)],
    "recording it again keeps them with it",
  );
});

test("the messages shown with one that is skipped in its turn go back to being unacted", { timeout }, async (t) => {
  const { sessions } = await open(t, tempDir(t, "turns"), "mixed");
  const first = await sessions.turns.record(draft(1));
  assert.ok(first);
  await sessions.turns.settle(first, { kind: "skipped" });
  const second = await sessions.turns.record(draft(2));
  assert.ok(second);
  assert.deepEqual(second.earlier, [snapshot(1)]);

  await sessions.turns.settle(second, { kind: "skipped" });

  assert.deepEqual((await sessions.turns.record(draft(3)))?.earlier, [snapshot(1), snapshot(2)]);
});

test("a message that was answered, stopped or failed is not shown again", { timeout }, async (t) => {
  const { sessions } = await open(t, tempDir(t, "turns"), "mixed");
  for (const [n, outcome] of [
    [1, { kind: "answered", answer: "1", text: "Hi." }],
    [2, { kind: "stopped" }],
    [3, { kind: "failed", reason: "no good" }],
  ] as const) {
    const recorded = await sessions.turns.record(draft(n));
    assert.ok(recorded);
    await sessions.turns.settle(recorded, outcome);
  }

  assert.deepEqual((await sessions.turns.record(draft(4)))?.earlier, []);
});

test("the cursor is kept, and starts out unset", { timeout }, async (t) => {
  const { sessions } = await open(t, tempDir(t, "turns"), "mixed");
  assert.equal(await sessions.turns.cursor(), undefined);

  await sessions.turns.setCursor(7);
  assert.equal(await sessions.turns.cursor(), 7);
  await sessions.turns.setCursor(0);
  assert.equal(await sessions.turns.cursor(), 0, "zero is a place, not the lack of one");
});

test("sessions, the outbox, unacted messages and the cursor are all there after a restart", { timeout }, async (t) => {
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

test("no session keeps instructions of its own, and any an earlier start stored are cleared at the next start", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const before = await open(t, home, "mixed");
  await before.sessions.turns.record(draft(1));
  const instructionsOf = async (host: typeof before.host): Promise<(string | undefined)[]> => {
    const threads = (await host.harness.snapshot(ThreadsDoc, context))?.sessions ?? {};
    const agents = await Promise.all(
      Object.values(threads).map(async (session) =>
        (await host.harness.conversation(session.conversationId as ConversationId, context))?.agent(context),
      ),
    );
    return agents.map((agent) => agent?.instructions);
  };
  assert.deepEqual(await instructionsOf(before.host), [undefined], "a new session has none");
  const threads = (await before.host.harness.snapshot(ThreadsDoc, context))?.sessions ?? {};
  const stored = await before.host.harness.conversation(threads.th_1?.conversationId as ConversationId, context);
  await stored?.configure({ instructions: "Answer in rhyme." }, context);
  assert.deepEqual(await instructionsOf(before.host), ["Answer in rhyme."]);
  await before.close();

  const after = await open(t, home, "mixed");

  assert.deepEqual(await instructionsOf(after.host), [undefined]);
});

test("a session for a thread works in the home, with the model the home names", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { host, sessions } = await open(t, home, "mixed");
  await sessions.turns.record(draft(1));

  const threads = (await host.harness.snapshot(ThreadsDoc, context))?.sessions ?? {};
  const conversation = await host.harness.conversation(threads.th_1?.conversationId as ConversationId, context);
  const agent = await conversation?.agent(context);

  assert.equal(agent?.cwd, home);
  assert.equal(agent.model?.provider, "faux");
});

test("a turn can be waited for again after it ended, and a wait that is cancelled does not stop the work", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const { sessions } = await open(t, home, "gated");
  const recorded = await sessions.turns.record(draft(1));
  assert.ok(recorded);
  const turn: Turn = await sessions.turns.start(recorded, "hello");

  const cancel = new AbortController();
  const waiting = assert.rejects(turn.ended(cancel.signal));
  cancel.abort(new Error("enough"));
  await waiting;
  releaseGate(home);

  await turn.ended(never);
  assert.equal((await turn.outcome()).kind, "answered");
});
