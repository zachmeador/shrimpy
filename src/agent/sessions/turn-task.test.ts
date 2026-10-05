import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type CommitPublication, type ConversationId, defineExtension, defineTask } from "@earendil-works/pi-durable";
import { eventually, stopAfter, tempDir, until } from "../../lib/testing/index.ts";
import { type ChatInput, type Delivery, idOf, isChat, type Snapshot, type TurnOutcome } from "../chat/index.ts";
import { openHost } from "../host/index.ts";
import { type FauxScenario, fauxModels, releaseGate } from "../testing/index.ts";
import { SessionsDoc } from "./documents.ts";
import { createSessions, turnTask } from "./index.ts";
import { TURN_TASK } from "./turn-task.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

function snapshot(n: number, text = `message ${String(n)}`): Snapshot {
  return { kind: "posted", id: `evt_${String(n)}`, seq: n, author: "Zach", text, sentAt: 1_700_000_000_000 + n * 1000 };
}

function draft(n: number, text?: string): Omit<ChatInput, "earlier" | "cancelled"> {
  return { event: snapshot(n, text), threadId: "th_1", channelId: "ch_1" };
}

/** What chat was told, in order. `fail` makes telling go wrong for the outcomes it returns an error for. */
function recordingDelivery(fail: (outcome: TurnOutcome) => Error | undefined = () => undefined) {
  const told: { id: string; outcome: TurnOutcome; earlier: string[] }[] = [];
  const delivery: Delivery = {
    attach: () => undefined,
    tell(outstanding, outcome) {
      const failure = fail(outcome);
      if (failure !== undefined) return Promise.reject(failure);
      told.push({ id: idOf(outstanding), outcome, earlier: isChat(outstanding) ? outstanding.earlier.map((event) => event.id) : [] });
      return Promise.resolve();
    },
    close: () => undefined,
  };
  return { delivery, told };
}

interface OpenOptions {
  delivery?: Delivery;
  /** How fast the model streams. Fast unless a test needs to catch a turn running. */
  tokensPerSecond?: number;
  /** Wait before an event's hand-over starts, as if the engine ran the tasks in another order. */
  pace?: (input: ChatInput, signal: AbortSignal) => Promise<void>;
}

/** The task, except that each hand-over starts when `pace` lets it. */
function paced(turn: ReturnType<typeof turnTask>, pace: NonNullable<OpenOptions["pace"]>) {
  const real = turn.task.definition;
  const task = defineTask({
    ...real,
    phases: {
      ...real.phases,
      handOver: async (running, runtime, taskContext) => {
        await pace(running.input as ChatInput, runtime.signal);
        await real.phases.handOver(running, runtime, taskContext);
      },
    },
  });
  return { task, extension: defineExtension({ name: "turns", tasks: [task] }) };
}

/** An agent's host and sessions on `home`, stopped when the test ends. `stop` ends it earlier, as a crash would. */
async function open(t: TestContext, home: string, scenario: FauxScenario, options: OpenOptions = {}) {
  const delivery = options.delivery ?? recordingDelivery().delivery;
  const reports: Error[] = [];
  const { models, model } = fauxModels({ home, scenario, tokensPerSecond: options.tokensPerSecond ?? 4000 });
  const real = turnTask({ delivery, onError: (error) => reports.push(error) });
  const turn = options.pace === undefined ? real : paced(real, options.pace);
  const host = await openHost({ home, models });
  host.install(turn.extension);
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await host.close();
  };
  // A model held at the gate lets go first, so that closing doesn't wait for it.
  stopAfter(t, async () => {
    releaseGate(home);
    await stop();
  });
  const sessions = createSessions(host.harness, { model, cwd: home }, turn.task);
  await sessions.applyDefaults();
  host.resume();
  return { host, sessions, reports, stop };
}

type Opened = Awaited<ReturnType<typeof open>>;

/** The request IDs of the inputs no turn has answered yet, in the order they reached their session. */
async function handedOver(host: Opened["host"]): Promise<string[]> {
  const { submissions } = await host.harness.inspect(context);
  return submissions.flatMap((submission) => (submission.requestId === undefined ? [] : [submission.requestId]));
}

/** Where the tasks that followed events ended. */
async function endedTasks(host: Opened["host"]) {
  const page = await host.harness.commit((tx) => tx.scanTasks({ kind: TURN_TASK, status: "terminal" }, 100), context);
  return page.items.map((record) => (record.state.status === "terminal" ? record.state.outcome.status : undefined));
}

test("taking an event up makes its session, the task that follows it and the cursor's move in one commit", { timeout }, async (t) => {
  const { host, sessions } = await open(t, tempDir(t, "turns"), "mixed");
  const published: CommitPublication[] = [];
  host.harness.subscribeCommits((publication) => published.push(publication));

  await sessions.admissions.admit(draft(1));

  const commits = published.filter((publication) => publication.changes.some((change) => change.type === "conversation"));
  assert.equal(commits.length, 1, "the session is made in one commit");
  const changes = commits[0]?.changes ?? [];
  const kinds = changes.flatMap((change) => (change.type === "document" ? [change.record.kind] : []));
  assert.ok(kinds.includes("shrimpy.threads") && kinds.includes("shrimpy.feed"), `with its thread and the cursor: ${String(kinds)}`);
  const task = changes.find((change) => change.type === "task");
  assert.ok(task?.type === "task" && task.value.kind === TURN_TASK && task.value.background, "and a background task");
  assert.equal(await sessions.admissions.cursor(), 1);
});

test("events taken up together reach their session in the order of the events, whichever task starts first, urgent ones included", { timeout }, async (t) => {
  const ids = Array.from({ length: 12 }, (_, index) => index + 1);
  // The later the event, the sooner its task starts.
  const reversed = (input: ChatInput, signal: AbortSignal) => delay((ids.length - input.event.seq) * 15, undefined, { signal });
  const { host, sessions } = await open(t, tempDir(t, "turns"), "gated", { pace: reversed });

  // Every third event is urgent, so the session is handed steers among the follow-ups.
  for (const n of ids) await sessions.admissions.admit(n % 3 === 0 ? { ...draft(n), urgent: true } : draft(n));

  const reached = await eventually(() => handedOver(host), (found) => found.length === ids.length, {
    what: "every event to reach the session",
  });
  assert.deepEqual(reached, ids.map((n) => `chat:evt_${String(n)}`));
});

test("events taken up before a restart and after it reach their session in the order of the events", { timeout }, async (t) => {
  const home = tempDir(t, "turns");
  const before = await open(t, home, "gated", { pace: (_input, signal) => delay(60_000, undefined, { signal }) });
  for (const n of [1, 2, 3, 4]) await before.sessions.admissions.admit(draft(n));
  assert.deepEqual(await handedOver(before.host), [], "none of them reached the session before the engine went");
  await before.stop();

  const reversed = (input: ChatInput, signal: AbortSignal) => delay((8 - input.event.seq) * 15, undefined, { signal });
  const after = await open(t, home, "gated", { pace: reversed });
  for (const n of [5, 6, 7]) await after.sessions.admissions.admit(draft(n));

  const reached = await eventually(() => handedOver(after.host), (found) => found.length === 7, {
    what: "every event to reach the session",
  });
  assert.deepEqual(reached, [1, 2, 3, 4, 5, 6, 7].map((n) => `chat:evt_${String(n)}`));
});

test("a failure while handing an event over leaves a failed receipt with the reason, is reported, and ends the task by its own hand", { timeout }, async (t) => {
  const { delivery, told } = recordingDelivery();
  const { host, sessions, reports } = await open(t, tempDir(t, "turns"), "mixed", { delivery });
  await sessions.admissions.admit(draft(1));
  await until(() => told.length === 1, "the first event to be told");
  // A passive entry already holds the request ID the second event will be handed over with.
  const conversationId = (await host.harness.snapshot(SessionsDoc, context))?.sessions.th_1?.conversationId;
  const session = await host.harness.conversation(conversationId as ConversationId, context);
  await session?.submit({ type: "write", entry: { kind: "test.note" }, requestId: "chat:evt_2" }, context);

  await sessions.admissions.admit(draft(2));

  await until(() => told.length === 2, "the second event to be told");
  const outcome = told[1]?.outcome;
  assert.ok(outcome?.kind === "failed");
  assert.match(outcome.reason, /^The agent hit an internal error: .*already identifies a submission/);
  assert.equal(reports.length, 1);
  assert.ok(reports[0]?.message.includes("evt_2") && reports[0].message.includes("already identifies"), String(reports[0]?.message));
  await eventually(() => endedTasks(host), (ended) => ended.length === 2, { what: "both tasks to end" });
  assert.deepEqual(await endedTasks(host), ["completed", "completed"], "neither was left to the engine to fault");
});

test("a failure while telling chat is told as a failure, once, and is reported", { timeout }, async (t) => {
  const { delivery, told } = recordingDelivery((outcome) => (outcome.kind === "answered" ? new Error("The disk is full.") : undefined));
  const { host, sessions, reports } = await open(t, tempDir(t, "turns"), "mixed", { delivery });

  await sessions.admissions.admit(draft(1));

  await until(() => told.length === 1, "the event to be told");
  assert.deepEqual(told[0]?.outcome, { kind: "failed", reason: "The agent hit an internal error: The disk is full." });
  assert.equal(reports.length, 1);
  assert.ok(reports[0]?.message.includes("evt_1") && reports[0].message.includes("The disk is full."), String(reports[0]?.message));
  await eventually(() => endedTasks(host), (ended) => ended.length === 1, { what: "the task to end" });
  assert.deepEqual(await endedTasks(host), ["completed"]);
});

test("a task that is aborted stops its event's turn, tells chat it was stopped, and ends as aborted", { timeout }, async (t) => {
  const { delivery, told } = recordingDelivery();
  const { host, sessions, reports } = await open(t, tempDir(t, "turns"), "mixed", { delivery, tokensPerSecond: 100 });
  await sessions.admissions.admit(draft(1, "stream a long answer"));
  const { tasks } = await eventually(
    () => host.harness.inspect(context),
    (found) => found.submissions.some((submission) => submission.status === "placed"),
    { what: "the turn to start" },
  );
  const id = tasks.find(({ record }) => record.kind === TURN_TASK)?.record.id;
  assert.ok(id !== undefined);

  await host.harness.abortTask(id, context);

  await until(() => told.length === 1, "the event to be told");
  assert.deepEqual(told[0]?.outcome, { kind: "stopped" });
  await eventually(() => endedTasks(host), (ended) => ended.length === 1, { what: "the task to end" });
  assert.deepEqual(await endedTasks(host), ["aborted"]);
  assert.deepEqual(reports, []);
});
