import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { AgentConnection, Occurrence, TriggerDetail } from "../contracts/agent/index.ts";
import { eventually, tempDir, useRuntimeDir, waitForView } from "../lib/testing/index.ts";
import { homePaths } from "./home/index.ts";
import {
  type AgentRig,
  assistantItems,
  attachThread,
  leaveBreadcrumb,
  startAgentChild,
  startAgentRig,
  startChatServer,
  talkTo,
  writeTrigger,
} from "./testing/index.ts";

/*
 * Breadcrumbs: facts that move, kept as files in the home and shown to a session
 * once, with its next input, when they are new to it. The real engine is under the
 * agent, with the real chat server, and the model is scripted. Its answer to a
 * message says what the message came with, so each test reads what the model was
 * shown from what the agent replied.
 */

const timeout = 40_000;

/** How many times `text` is in `where`. */
const times = (where: string, text: string): number => where.split(text).length - 1;

/** A trigger's detail once `done` accepts it. */
const trigger = (connection: AgentConnection, name: string, done: (detail: TriggerDetail) => boolean, what: string) =>
  eventually(() => connection.trigger(name), done, { what, timeoutMs: 20_000 });

/** How many of a trigger's occurrences have ended in this way. */
const ended = (detail: TriggerDetail, how: Occurrence["ended"]): number => detail.occurrences.filter((occurrence) => occurrence.ended === how).length;

/** Say something in a thread and read what the model came back with, which is what it was shown. */
async function shown(rig: AgentRig, text: string, threadId?: string): Promise<string> {
  const said = await rig.say(text, threadId);
  await rig.receiptOn(said);
  return (await rig.replies(threadId)).at(-1)?.text ?? "";
}

test("a breadcrumb that changed is shown once to each session and not again, and a session idle through several changes is shown the latest once", { timeout }, async (t) => {
  const rig = await startAgentRig(t);
  const side = (await rig.newThread("Side")).id;

  leaveBreadcrumb(rig.home, "build", "build: v1");
  assert.equal(times(await shown(rig, "first A"), "build: v1"), 1, "a session's first input carries every file");
  assert.equal(times(await shown(rig, "first B", side), "build: v1"), 1, "and so does another session's, which is not the first's to spend");
  assert.equal(times(await shown(rig, "second A"), "build: v1"), 0, "and then it is not shown again");

  // Session B is idle through three changes, and A sees none of them go by.
  for (const version of ["v2", "v3", "v4"]) leaveBreadcrumb(rig.home, "build", `build: ${version}`);
  const secondB = await shown(rig, "second B", side);
  assert.equal(times(secondB, "build: v4"), 1, "the session that was idle is shown the latest");
  assert.equal(times(secondB, "build: v2") + times(secondB, "build: v3"), 0, "and not the ones it missed");
  assert.equal(times(await shown(rig, "third B", side), "build:"), 0);

  // A's own record is its own: it was shown v1, so v4 is new to it.
  assert.equal(times(await shown(rig, "third A"), "build: v4"), 1);
  assert.equal(times(await shown(rig, "fourth A"), "build:"), 0);
  assert.deepEqual(rig.reports, []);
});

test("a trigger that notes writes its file and wakes nobody, and the next input of a session carries what it wrote", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  writeFileSync(join(home, "status.txt"), "build 41 failed\n");
  writeTrigger(home, "build", ["every: 1s", "check: cat status.txt", "then: note"], "The build's state. Look closer with gh run list.");
  const rig = await startAgentRig(t, { home, shortestEveryMs: 200 });
  const connection = await rig.connect();

  const detail = await trigger(connection, "build", (found) => ended(found, "noted") >= 1 && ended(found, "quiet") >= 1, "the news to be noted and then found again");

  const file = readFileSync(join(homePaths(home).breadcrumbs, "build.md"), "utf8");
  assert.ok(file.includes("The build's state.") && file.includes("build 41 failed"), file);
  assert.ok(file.indexOf("The build's state.") < file.indexOf("build 41 failed"), "the prompt is above the output");
  assert.equal(ended(detail, "noted"), 1, "and the same news is not noted again");
  assert.equal(existsSync(join(home, "requests.jsonl")), false, "nobody was woken");
  assert.ok(!(await connection.sessions()).some((session) => session.id === "trigger:build"), "and no session was made for it");

  const next = await shown(rig, "what is new?");
  assert.ok(next.includes("The build's state.") && next.includes("build 41 failed"), next);
  assert.equal(times(await shown(rig, "and now?"), "build 41 failed"), 0);
  assert.deepEqual(rig.reports, []);
});

test("the breadcrumbs of an input that was skipped come again with the session's next input", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { tokensPerSecond: 200 });
  const running = await rig.say("stream a long answer");
  await rig.untilWorking();
  const { session } = await rig.attach();
  await waitForView(session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) > 20);
  // The message that waits behind the running turn is taken up with the breadcrumb, which the stop then takes back.
  leaveBreadcrumb(rig.home, "build", "build: failing");
  const waiting = await rig.say("this one waits behind the first");
  await waitForView(session, (view) => view.status.queued.length === 1);

  await session.stop();

  assert.equal((await rig.receiptOn(running)).status, "stopped");
  assert.equal((await rig.receiptOn(waiting)).status, "skipped");
  await rig.untilIdle();
  assert.equal(times(await shown(rig, "now answer me"), "build: failing"), 1, "it comes with the next input");
  assert.equal(times(await shown(rig, "and once more"), "build: failing"), 0, "and then not again");
});

test("an agent killed between taking an input up and its turn shows the breadcrumbs once: neither lost nor repeated", { timeout: 60_000 }, async (t) => {
  useRuntimeDir(t);
  const home = tempDir(t, "agent");
  const chat = await startChatServer(t);
  const first = await startAgentChild(t, home, "mixed", 40);
  const talk = await talkTo(chat);
  const one = await talk.say("stream a long answer");
  await talk.untilWorking();
  // This message is taken up while the first turn runs, and waits behind it. The kill falls before its turn begins.
  leaveBreadcrumb(home, "build", "build: failing");
  const two = await talk.say("and then this");
  const watching = await attachThread(home, talk.thread.id);
  await waitForView(watching.session, (view) => view.status.queued.length === 1);
  await watching.connection.close();
  await first.kill("SIGKILL");

  await startAgentChild(t, home, "mixed", 4000);

  assert.equal((await talk.receiptOn(one)).status, "answered");
  assert.equal((await talk.receiptOn(two)).status, "answered");
  const [, second = ""] = (await talk.replies()).map((reply) => reply.text);
  assert.equal(times(second, "build: failing"), 1, "it was not lost with the agent, and shown once");
  const three = await talk.say("one more");
  await talk.receiptOn(three);
  const [, , third = ""] = (await talk.replies()).map((reply) => reply.text);
  assert.ok(third.includes("one more"), third);
  assert.equal(times(third, "build: failing"), 0, "and not shown again");
});
