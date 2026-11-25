import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Session, type SessionItem } from "../contracts/agent/index.ts";
import { isRefusal } from "../lib/refusal/index.ts";
import { eventually, tempDir, until, waitForView } from "../lib/testing/index.ts";
import {
  answered,
  assistantItems,
  attachThread,
  releaseGate,
  type SessionView,
  startAgentRig,
  toolItems,
} from "./testing/index.ts";
import { valueOf } from "../contracts/chat/testing/index.ts";

const timeout = 30_000;

test("an agent has no sessions until it is talked to, then one for each thread, each with a history of its own", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  const side = await rig.newThread();
  const connection = await rig.connect();
  assert.deepEqual(await connection.sessions(), []);

  const one = await rig.say("only in the first thread");
  const two = await rig.say("only in the side thread", side.id);
  await rig.receiptOn(one);
  await rig.receiptOn(two);

  const threads = (await eventually(() => connection.sessions(), (sessions) => sessions.length === 2)).map((session) => session.threadId);
  assert.deepEqual(threads.toSorted(), [rig.thread.id, side.id].toSorted());
  const said = (view: SessionView): string[] =>
    view.items.flatMap((item) => (item.type === "user" ? [item.text.split("\n").at(-1) ?? ""] : []));
  assert.deepEqual(said((await rig.attach(rig.thread.id)).session.view), ["only in the first thread"]);
  assert.deepEqual(said((await rig.attach(side.id)).session.view), ["only in the side thread"]);
  assert.equal((await rig.replies(rig.thread.id)).length, 1);
  assert.equal((await rig.replies(side.id)).length, 1, "each reply is in the thread its message came from");
});

test("a client steers the session behind a thread, and a retry with the same request ID is the same input", { timeout }, async (t) => {
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
  const second = await attachThread(t, rig.home, rig.thread.id);
  assert.deepEqual(second.session.view, view);
});

test("a session in the middle of a turn is listed as working, and as idle once it is answered", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { scenario: "gated" });
  const asked = await rig.say("hello");
  const connection = await rig.connect();

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
  assert.equal(answer?.ended?.how, "interrupted");
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
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("first"));
  const first = await rig.attach();
  const second = await rig.attach();

  const { submission } = await first.session.steer("stream a long answer");
  const abandoned = assert.rejects(first.session.wait(submission));
  await waitForView(first.session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 20);

  await first.connection.close();
  // How much of the answer was written by the time the client was gone, as the other client sees it.
  const written = assistantItems(second.session.view).at(-1)?.text.length ?? 0;
  await abandoned;

  const settled = await second.session.wait(submission);
  assert.equal(settled.status, "answered");
  assert.ok(settled.text.endsWith("line 40: the quick brown fox jumps over the lazy dog"));
  assert.ok(written < settled.text.length / 2, `leaving waited for the answer: ${String(written)} of ${String(settled.text.length)} characters were written`);
});

test("a thread the agent has no session for yet is refused, and the connection is still good", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("first"));
  const connection = await rig.connect();

  await assert.rejects(connection.attach("th_nothing"), isRefusal);
  // The sessions are looked up by the thread's ID, which no client-sent name may mistake for anything else.
  await assert.rejects(attachThread(t, rig.home, "constructor"), isRefusal);
  assert.equal((await connection.attach(rig.thread.id)).id, rig.thread.id);
});

test("a file of the home that can't be used is left out and reported when the agent starts, and the agent starts anyway", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  mkdirSync(join(home, "skills", "broken"), { recursive: true });
  writeFileSync(join(home, "skills", "broken", "SKILL.md"), "# no front matter\n");

  const rig = await startAgentRig(t, { home });

  assert.equal(rig.reports.length, 1);
  assert.ok((rig.reports[0] as Error).message.includes("skills/broken/SKILL.md"), "naming the file");
  await rig.receiptOn(await rig.say("hello"));
});

test("a client holding a session sees it once the agent makes it, and its turn live", { timeout }, async (t) => {
  // About a thousand characters a second, so the answer streams for a few seconds.
  const rig = await startAgentRig(t, { tokensPerSecond: 100, tokenSize: { min: 10, max: 10 } });
  const person = await rig.chat.gateway.connect();
  // Held before the agent has the session: refused for now, and followed.
  const session = await person.host.get(Session, { agent: rig.partner.id, session: rig.thread.id }, BACKGROUND_CONTEXT);
  assert.notEqual(session.refusal.value, null);

  const asked = await rig.say("stream a long answer");
  await until(() => session.refusal.value === null, "the session to show once the agent makes it");
  // A partial answer names no entry, since it is not stored yet, and grows as it arrives.
  await until(() => {
    const last = session.window.value.items.at(-1);
    return last?.type === "assistant" && last.streaming && last.entry === null && last.text.length > 20;
  }, "a partial answer to show as it arrives");
  assert.equal(session.status.value?.busy, true);
  await rig.receiptOn(asked);
  await until(() => session.status.value?.busy === false, "the session to be idle");
  const answer = session.window.value.items.at(-1);
  assert.ok(answer?.type === "assistant" && !answer.streaming && answer.entry !== null, "the answer, stored, names its entry");
  assert.ok(answer.text.endsWith("line 40: the quick brown fox jumps over the lazy dog"));
});

test("a client pages back through a session's whole history with read", { timeout: 60_000 }, async (t) => {
  const rig = await startAgentRig(t);
  await rig.receiptOn(await rig.say("number 0"));
  const { session } = await rig.attach();
  for (let index = 1; index < 40; index++) {
    const { submission } = await session.steer(`number ${String(index)}`);
    await session.wait(submission);
  }

  const person = await rig.chat.gateway.connect();
  const held = await person.host.get(Session, { agent: rig.partner.id, session: rig.thread.id }, BACKGROUND_CONTEXT);
  const asked = (items: readonly SessionItem[]): string[] =>
    items.flatMap((item) => (item.type === "user" ? [/number \d+/.exec(item.text)?.[0] ?? item.text] : []));
  const window = held.window.value;
  assert.notEqual(window.before, null, "a long session's window starts after its start");
  let before = window.before;
  let earlier: SessionItem[] = [];
  while (before !== null) {
    const page = valueOf(await held.read({ before, limit: 7 }, BACKGROUND_CONTEXT));
    earlier = [...page.items, ...earlier];
    before = page.before;
  }
  assert.deepEqual(asked([...earlier, ...window.items]), Array.from({ length: 40 }, (_, index) => `number ${String(index)}`));
  const entries = [...earlier, ...window.items].flatMap((item) => (item.type === "user" ? [item.entry] : []));
  assert.deepEqual(entries, entries.toSorted((a, b) => (a ?? 0) - (b ?? 0)), "in the order of their entries");
});
