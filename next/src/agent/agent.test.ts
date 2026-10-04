import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { AgentConnectionLostError, type SessionView } from "../contracts/agent/index.ts";
import { attachLocal } from "../contracts/agent/node.ts";
import { eventually, settle, tempDir, until, waitForView } from "../lib/testing/index.ts";
import { HomeOwnedError } from "./host/index.ts";
import { startAgent } from "./index.ts";
import {
  answered,
  assistantItems,
  attachThread,
  fauxModels,
  releaseGate,
  startAgentRig,
  toolItems,
} from "./testing/index.ts";

const timeout = 30_000;

test("an agent has no sessions until it is talked to, then one for each thread", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  const connection = await attachLocal(rig.home);
  t.after(() => connection.close());
  assert.deepEqual(await connection.sessions(), []);
  await assert.rejects(rig.attach(), /This agent has no session for thread th_\w+ yet\./);

  await rig.receiptOn(rig.say("hello"));
  const side = await rig.newThread("a side topic");
  await rig.receiptOn(rig.say("hello in the side thread", side.id));

  assert.deepEqual(await connection.sessions(), [
    { threadId: rig.thread.id, channelId: rig.thread.channelId, working: false },
    { threadId: side.id, channelId: rig.thread.channelId, working: false },
  ]);
});

test("each thread has a session with a history of its own", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  const side = await rig.newThread();
  const one = rig.say("only in the main thread");
  const two = rig.say("only in the side thread", side.id);
  await rig.receiptOn(one);
  await rig.receiptOn(two);

  const main = await rig.attach(rig.thread.id);
  const other = await rig.attach(side.id);

  const said = (view: SessionView): string[] =>
    view.items.flatMap((item) => (item.type === "user" ? [item.text.split("\n").at(-1) ?? ""] : []));
  assert.deepEqual(said(main.session.view), ["only in the main thread"]);
  assert.deepEqual(said(other.session.view), ["only in the side thread"]);
  assert.deepEqual(
    rig.replies(side.id).map((reply) => reply.text.split("\n")[0]),
    [`You said: Thread ${side.id} in channel ${side.channelId}.`],
  );
});

test("a client attaches to the session behind a thread, steers it, and watches the turn", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  const asked = rig.say("show me the files");
  await rig.receiptOn(asked);
  const { connection, session } = await rig.attach();

  const first = await session.steer("show me the files again", "request-1");
  const retried = await session.steer("show me the files again", "request-1");
  assert.equal(retried.submission, first.submission);

  const view = await waitForView(session, (current) => answered(current) && toolItems(current).length === 2);
  assert.deepEqual(
    view.items.map((item) => item.type),
    ["user", "assistant", "tool", "assistant", "user", "assistant", "tool", "assistant"],
  );
  const written = view.items[0];
  assert.ok(written?.type === "user");
  assert.match(
    written.text,
    /^Thread th_\w+ in channel ch_\w+\.\n\nZach wrote at \d{4}-\d\d-\d\dT[\d:]{8}Z:\nshow me the files$/,
  );
  assert.deepEqual(toolItems(view)[0]?.status, "done");
  assert.equal(toolItems(view)[0]?.output, "listing the work directory\ndone\n");
  assert.deepEqual(view.status.activity, { kind: "idle" });
  assert.ok(view.status.usage.output > 0);

  const second = await attachLocal(rig.home);
  const sameSession = await second.attach(rig.thread.id);
  assert.deepEqual(sameSession.view, view);
  await second.close();
  await connection.close();
});

test("a session in the middle of a turn is listed as working, and as idle once it is answered", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { scenario: "gated" });
  const asked = rig.say("hello");
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

test("a handle's subscribe gives the listener the current view once, then each change", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(rig.say("first"));
  const { session } = await rig.attach();

  const seen: SessionView[] = [];
  const stop = session.subscribe((view) => seen.push(view));
  await settle();
  assert.deepEqual(seen, [session.view]);

  await session.steer("say hello");
  const answer = await waitForView(session, (view) => answered(view) && view.items.length > seen[0]!.items.length);
  assert.ok(seen.length > 1);
  assert.deepEqual(seen.at(-1), answer);

  stop();
  const delivered = seen.length;
  const { submission } = await session.steer("and again");
  await session.wait(submission);
  assert.equal(seen.length, delivered);
});

test("stop stops a streaming answer and keeps what arrived, and the message is marked stopped", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 40 });
  const asked = rig.say("stream a long answer");
  await until(() => rig.chat.chat.working(rig.thread.id).length === 1, "the agent to start working");
  const { session } = await rig.attach();
  await waitForView(session, (view) => (assistantItems(view)[0]?.text.length ?? 0) > 20);

  await session.stop();

  const view = await waitForView(session, (current) => !current.status.busy);
  const answer = assistantItems(view).at(-1);
  assert.equal(answer?.stopReason, "aborted");
  assert.ok(answer.text.startsWith("line 01"));
  assert.equal((await rig.receiptOn(asked)).status, "stopped");
  assert.deepEqual(rig.replies(), [], "and nothing is posted");
});

test("a client waits for an input to end, and is told how it ended", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(rig.say("first"));
  const { session } = await rig.attach();

  const { submission } = await session.steer("say hello", "request-1");
  const settled = await session.wait(submission);
  assert.equal(settled.status, "answered");
  assert.match(settled.text, /^You said: say hello\n\n- first point/);

  // The ending is recorded: asking again gives it back, and the answer is the one in the session.
  assert.deepEqual(await session.wait(submission), settled);
  const view = await waitForView(session, answered);
  assert.equal(assistantItems(view).at(-1)?.text, settled.text);
});

test("input steered into a session is not a message, so nothing is posted for its answer", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  const asked = rig.say("first");
  await rig.receiptOn(asked);
  const { session } = await rig.attach();

  const { submission } = await session.steer("a note from the console");
  await session.wait(submission);

  await settle();
  assert.deepEqual(
    rig.replies().map((reply) => reply.text.split("\n").slice(0, 3).join("\n")),
    [
      `You said: Thread ${rig.thread.id} in channel ${rig.thread.channelId}.\n\nZach wrote at ${new Date(asked.sentAt).toISOString().replace(/\.\d{3}Z$/, "Z")}:`,
    ],
  );
});

test("several clients can wait for the same input, and are all told how it ended", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 400 });
  await rig.receiptOn(rig.say("first"));
  const first = await rig.attach();
  const second = await rig.attach();

  const { submission } = await first.session.steer("stream a long answer");
  const [one, two] = await Promise.all([first.session.wait(submission), second.session.wait(submission)]);

  assert.equal(one.status, "answered");
  assert.deepEqual(two, one);
  assert.ok(one.text.endsWith("line 40: the quick brown fox jumps over the lazy dog"));
});

test("a client that leaves while waiting does not stop the work, or wait for it", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 200 });
  await rig.receiptOn(rig.say("first"));
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

test("an input that is stopped ends cancelled", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 40 });
  await rig.receiptOn(rig.say("first"));
  const { session } = await rig.attach();

  const { submission } = await session.steer("stream a long answer");
  const waiting = session.wait(submission);
  await waitForView(session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 20);

  await session.stop();

  assert.deepEqual(await waiting, { status: "cancelled" });
});

test("an input the model could not answer ends unanswered, with the reason", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(rig.say("first"));
  const { session } = await rig.attach();

  const { submission } = await session.steer("please refuse");

  assert.deepEqual(await session.wait(submission), {
    status: "unanswered",
    reason: "model_error",
    detail: "The model refused the request.",
  });
});

test("a call waiting when the agent stops fails with a message a person can use", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 40 });
  await rig.receiptOn(rig.say("first"));
  const { connection, session } = await rig.attach();

  const { submission } = await session.steer("stream a long answer");
  const waiting = assert.rejects(session.wait(submission), AgentConnectionLostError);
  await waitForView(session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 20);

  await rig.agent.close({ now: true });

  await waiting;
  // Later calls fail the same way, instead of with the transport's own words.
  await assert.rejects(session.steer("anyone there?"), AgentConnectionLostError);
  await assert.rejects(
    connection.sessions(),
    /Lost the connection to the agent\. If it stopped, the work that was running resumes when it starts again\./,
  );
});

test("a wait on a submission that does not exist is refused", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(rig.say("first"));
  const { session } = await rig.attach();

  await assert.rejects(session.wait(999), { code: "service_invalid_value", message: "Unknown submission: 999" });
});

test("a second agent cannot take a home that has an owner", { timeout }, async (t) => {
  const rig = await startAgentRig(t);

  await assert.rejects(startAgent({ home: rig.home, name: "scout", ...fauxModels({ home: rig.home, scenario: "chat" }) }), HomeOwnedError);
});

test("a thread the agent has no session for yet is refused, with a message that says so", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(rig.say("first"));
  const connection = await attachLocal(rig.home);
  t.after(() => connection.close());

  await assert.rejects(connection.attach("th_nothing"), {
    code: "service_invalid_value",
    message: "This agent has no session for thread th_nothing yet.",
  });
  await assert.rejects(connection.attach("1"), /This agent has no session for thread 1 yet\./);
  await assert.rejects(attachThread(rig.home, "constructor"), /This agent has no session for thread constructor yet\./);
  // And the connection is still good for a thread it does have.
  assert.equal((await connection.attach(rig.thread.id)).threadId, rig.thread.id);
});

test("a file of the home that can't be used is left out and reported when the agent starts, and the agent starts anyway", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  mkdirSync(join(home, "skills", "broken"), { recursive: true });
  writeFileSync(join(home, "skills", "broken", "SKILL.md"), "# no front matter\n");

  const rig = await startAgentRig(t, { home });

  assert.deepEqual(
    rig.reports.map((report) => (report as Error).message),
    ["skills/broken/SKILL.md was left out: it does not start with a front matter block, between --- lines."],
  );
  await rig.receiptOn(rig.say("hello"));
});
