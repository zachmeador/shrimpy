import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { initHome } from "../contracts/agent/node.ts";
import { memberNamed, type Speaking } from "../contracts/chat/testing/index.ts";
import { eventually, until, useRuntimeDir, within } from "../lib/testing/index.ts";
import {
  type Outcome,
  shrimpy,
  shrimpyInBackground,
  startScriptedAgent,
  startTalking,
  useShrimpyDir,
} from "./testing/index.ts";

/*
 * These tests talk to an agent as people do: every `shrimpy` is its own
 * process, and so are the gateway and the chat server. The agent's side of chat
 * is not under test here, so a scripted member answers for it.
 */

const timeout = 60_000;

const answered = (text: string): Outcome => ({ status: "answered", text });

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** The ID of the thread a `run` started, which it prints on standard error. */
function startedThread(stderr: string): string {
  const started = /\b(th_\w+)/.exec(stderr);
  assert.ok(started?.[1], `no new thread was announced:\n${stderr}`);
  return started[1];
}

/** Your DM with scout, and the threads in it. */
async function scoutsThreads(you: Speaking) {
  const dm = (await you.channels()).find((channel) => channel.members.some((m) => m.name === "scout"));
  assert.ok(dm, "there is no DM with scout");
  return { dm, threads: await you.threads(dm.id) };
}

test("run posts to a new thread, prints the agent's reply, and puts the thread's ID on standard error", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const agent = await startScriptedAgent(t, { name: "scout", handle: () => answered("Three emails.") });

  const result = await shrimpy(["run", "scout", "what is in my inbox?"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Three emails.\n");
  const thread = startedThread(result.stderr);
  const you = await talking.you();
  const { threads } = await scoutsThreads(you);
  assert.deepEqual(
    threads.map((candidate) => candidate.id),
    [thread],
    "the DM has the new thread and no other",
  );
  const [asked, reply] = await you.read(thread, null, 10);
  assert.ok(asked && reply);
  assert.equal(asked.text, "what is in my inbox?");
  assert.equal(asked.author.id, you.me.id, "the command spoke as the person who runs it");
  const scout = await memberNamed(t, "scout");
  assert.equal(reply.author.id, scout.id);
  assert.deepEqual(asked.receipts, [
    { memberId: scout.id, event: asked.event, status: "answered", reply: reply.id, detail: null },
  ]);
  assert.equal(agent.offered.length, 1);
});

test("the exit code says how the agent dealt with the message", { timeout }, async (t) => {
  await startTalking(t);
  await startScriptedAgent(t, {
    name: "scout",
    handle: (message): Outcome => {
      if (message.text === "silent") return { status: "silent" };
      if (message.text === "fail") return { status: "failed", detail: "the model refused the request" };
      if (message.text === "behind a failure") return { status: "skipped", detail: "the turn ahead of it ran out of tokens" };
      if (message.text === "behind a stop") return { status: "skipped" };
      return message.text === "stop" ? { status: "stopped" } : { status: "answered", text: `ack: ${message.text}` };
    },
  });

  const quiet = await shrimpy(["run", "scout", "silent"]);
  const failed = await shrimpy(["run", "scout", "fail"]);
  const behindFailure = await shrimpy(["run", "scout", "behind a failure"]);
  const stopped = await shrimpy(["run", "scout", "stop"]);
  const behindStop = await shrimpy(["run", "scout", "behind a stop"]);
  const answer = await shrimpy(["run", "scout", "reply"]);

  assert.deepEqual([quiet.code, quiet.stdout], [0, ""]);
  assert.deepEqual([failed.code, failed.stdout], [1, ""]);
  assert.match(failed.stderr, /the model refused the request/);
  assert.deepEqual([behindFailure.code, behindFailure.stdout], [1, ""]);
  assert.match(behindFailure.stderr, /the turn ahead of it ran out of tokens/);
  assert.deepEqual([stopped.code, stopped.stdout], [130, ""]);
  assert.deepEqual([behindStop.code, behindStop.stdout], [130, ""]);
  assert.deepEqual([answer.code, answer.stdout], [0, "ack: reply\n"]);
});

test("--thread continues a thread, and a thread that is not in your DM with the agent gets nothing posted", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const agent = await startScriptedAgent(t, { name: "scout", handle: (m) => answered(`ack: ${m.text}`) });
  const first = await shrimpy(["run", "scout", "first"]);
  const thread = startedThread(first.stderr);

  const second = await shrimpy(["run", "scout", "second", "--thread", thread]);
  const nowhere = await shrimpy(["run", "scout", "third", "--thread", "th_nowhere"]);

  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.stdout, "ack: second\n");
  const you = await talking.you();
  assert.deepEqual((await you.read(thread, null, 10)).map((message) => message.text), [
    "first",
    "ack: first",
    "second",
    "ack: second",
  ]);
  assert.equal((await scoutsThreads(you)).threads.length, 1, "no new thread was made");
  assert.equal(nowhere.code, 1);
  assert.equal(nowhere.stdout, "");
  assert.equal(agent.offered.length, 2, "and the agent was offered nothing");
});

test("--no-wait exits once the message is posted and prints the IDs to follow up with", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", handle: () => finish.promise });

  const result = await shrimpy(["run", "scout", "when you can", "--no-wait"]);

  assert.equal(result.code, 0, result.stderr);
  const messageId = /\b(msg_\w+)/.exec(result.stdout)?.[1];
  const thread = /\b(th_\w+)/.exec(result.stdout)?.[1];
  assert.ok(messageId !== undefined && thread !== undefined, result.stdout);
  const you = await talking.you();
  const [message] = await you.read(thread, null, 10);
  assert.ok(message);
  assert.equal(message.id, messageId);
  assert.equal(message.text, "when you can");
  assert.deepEqual(message.receipts, [], "the agent has not finished, and the command did not wait for it");
  await until(() => agent.offered.length === 1, "the agent to be offered the message");
  finish.resolve(answered("done"));
  await eventually(() => you.read(thread, null, 10), (messages) => messages[0]?.receipts.length === 1);
});

test("stopping run while it waits leaves the message and the agent's work alone, and exits 130", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", handle: () => finish.promise });
  const waiting = shrimpyInBackground(t, ["run", "scout", "take your time"]);
  await until(() => agent.offered.length === 1, "the agent to be offered the message");

  waiting.kill("SIGINT");
  const result = await waiting.finished;

  assert.equal(result.code, 130);
  assert.equal(result.stdout, "");
  const thread = startedThread(result.stderr);
  // The message is where it was, and the agent still finishes what it was doing.
  const you = await talking.you();
  finish.resolve(answered("done anyway"));
  // The agent posts its reply first and leaves the receipt after it.
  const [message, reply] = await eventually(
    () => you.read(thread, null, 10),
    (messages) => messages.length === 2 && messages[0]?.receipts.length === 1,
    { what: "the reply, and the receipt on the message" },
  );
  assert.ok(message && reply);
  assert.equal(message.text, "take your time");
  assert.equal(reply.text, "done anyway");
  assert.equal(message.receipts[0]?.status, "answered");
});

test("run says so when the chat server goes away while it waits, instead of waiting for nothing", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", handle: () => finish.promise });
  const waiting = shrimpyInBackground(t, ["run", "scout", "take your time"]);
  await until(() => agent.offered.length === 1, "the agent to be offered the message");
  await until(() => /\bth_\w+/.test(waiting.output().stderr), "run to say which thread it started");

  await talking.chat.stop("SIGKILL");
  const result = await within(15_000, waiting.finished, "run ending");

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  const thread = startedThread(result.stderr);
  assert.ok(result.stderr.trim().split("\n").at(-1)?.includes(thread), "and the last thing it says is where the message is");
  finish.resolve(answered("too late"));
});

test("with no gateway running it says what to start, and exits 1", { timeout }, async (t) => {
  useRuntimeDir(t);

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /shrimpy up/);
});

test("nothing is posted to an agent that is not linked, and the error says where to start it", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "rex", handle: () => answered("woof") });
  await startScriptedAgent(t, { name: "scout", handle: () => answered("hi"), linked: false });
  await startScriptedAgent(t, { name: "crab", handle: () => answered("hi"), linked: false });
  initHome(join(useShrimpyDir(t), "agents", "scout"), { name: "scout" });

  const here = await shrimpy(["run", "scout", "hello"]);
  assert.equal(here.code, 1);
  assert.equal(here.stdout, "");
  assert.match(here.stderr, /shrimpy agent serve scout/);

  // Crab lives somewhere else, so no command typed here would start it.
  const elsewhere = await shrimpy(["run", "crab", "hello"]);
  assert.equal(elsewhere.code, 1);
  assert.equal(elsewhere.stdout, "");
  assert.doesNotMatch(elsewhere.stderr, /agent serve|shrimpy up/);
  assert.deepEqual(await (await talking.you()).channels(), [], "and nothing was posted for either, not even a DM");
});
