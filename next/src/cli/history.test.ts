import assert from "node:assert/strict";
import { userInfo } from "node:os";
import { test } from "node:test";
import { agentMember, type Message, type Thread } from "../contracts/chat/index.ts";
import { eventually, useRuntimeDir } from "../lib/testing/index.ts";
import {
  type Outcome,
  serveGateway,
  shrimpy,
  startScriptedAgent,
  startTalking,
  untilRegistered,
} from "./testing/index.ts";

/*
 * These tests look back at conversations as people do: every `shrimpy` is its
 * own process, and so are the gateway and the chat server. What the agent did
 * with each message is whatever a scripted member left as its receipt.
 */

const timeout = 60_000;
const you = userInfo().username;
const answered = (text: string): Outcome => ({ status: "answered", text });

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Times are the machine's local ones, so tests that look at lines compare them without. */
const withoutTimes = (lines: string[]): string[] =>
  lines.map((line) => line.replaceAll(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, "<time>"));

const linesOf = (text: string): string[] => text.trimEnd().split("\n");

/** The ID of the thread a `run` started, from the line it printed on standard error. */
function startedThread(stderr: string): string {
  const started = /^Thread (th_\w+) started\./m.exec(stderr);
  assert.ok(started?.[1], `no new thread was announced:\n${stderr}`);
  return started[1];
}

test("threads lists the threads of your DM, newest first, by name or first message, and marks what they are", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => answered("ok") });
  const first = await shrimpy(["run", "scout", "plan the trip"]);
  await shrimpy(["run", "scout", "what is in my inbox?"]);
  const connection = await talking.you();
  await connection.chat.archiveThread(startedThread(first.stderr), true);
  await connection.chat.renameThread(startedThread(first.stderr), "Trip");

  const result = await shrimpy(["threads", "scout"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  const lines = linesOf(result.stdout);
  assert.match(lines[0] ?? "", /^thread {11}updated {11}working {2}name$/);
  assert.deepEqual(withoutTimes(lines.slice(1)).map((line) => line.replace(/^th_\w{12}/, "<id>")), [
    "<id>  <time>           what is in my inbox?",
    "<id>  <time>           Trip [archived]",
    "<id>  <time>           (no messages yet) [main]",
  ]);
});

test("threads says who is working in a thread right now, and stops saying so when they are done", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => finish.promise });
  const asked = await shrimpy(["run", "scout", "take your time", "--no-wait"]);
  const thread = /in thread (th_\w+)\./.exec(asked.stdout)?.[1] ?? "";
  await eventually(() => Promise.resolve(agent.offered.length), (offered) => offered === 1);
  const connection = await talking.you();
  await eventually(
    async () => (await connection.chat.threads(agent.offered[0]?.channelId ?? "")).find((x) => x.id === thread)?.working.length,
    (working) => working === 1,
  );

  const busy = await shrimpy(["threads", "scout"]);
  const json = JSON.parse((await shrimpy(["threads", "scout", "--json"])).stdout) as Thread[];

  assert.ok(withoutTimes(linesOf(busy.stdout)).some((line) => line.includes(`${thread}  <time>  scout    take your time`)), busy.stdout);
  const marked = json.find((candidate) => candidate.id === thread);
  assert.ok(marked);
  assert.deepEqual(marked.working.map((mark) => mark.memberId), ["agent:scout"]);
  assert.equal(typeof marked.working[0]?.since, "number");

  finish.resolve(answered("done"));
  const done = await eventually(
    () => shrimpy(["threads", "scout"]),
    (result) => !result.stdout.includes("scout    take your time"),
  );
  assert.equal(done.code, 0);
});

test("threads --json prints the threads as data, newest first", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => answered("ok") });
  await shrimpy(["run", "scout", "one"]);
  await shrimpy(["run", "scout", "two"]);

  const result = await shrimpy(["threads", "scout", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(linesOf(result.stdout).length, 1);
  const threads = JSON.parse(result.stdout) as Thread[];
  assert.deepEqual(threads.map((thread) => thread.preview), ["two", "one", null]);
  assert.deepEqual(threads.map((thread) => thread.main), [false, false, true]);
});

test("threads with an agent you have never talked to says so, and makes nothing", { timeout }, async (t) => {
  const talking = await startTalking(t);

  const result = await shrimpy(["threads", "rex"]);
  const json = await shrimpy(["threads", "rex", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, 'You have not talked to rex yet. Start with: shrimpy run rex "<text>"\n');
  assert.equal(json.code, 0);
  assert.equal(json.stdout, "[]\n");
  assert.deepEqual(await (await talking.you()).chat.channels(), []);
});

test("threads and read say what to start when nothing is running, and exit 1", { timeout }, async (t) => {
  useRuntimeDir(t);
  const nothing = "No gateway is running on this machine. Start Shrimpy with: shrimpy up <home>... --data <dir>";

  for (const args of [["threads", "scout"], ["read", "th_anything"]]) {
    const result = await shrimpy(args);

    assert.equal(result.code, 1, args.join(" "));
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim(), nothing);
  }
  await serveGateway(t);
  for (const args of [["threads", "scout"], ["read", "th_anything"]]) {
    const result = await shrimpy(args);

    assert.equal(result.code, 1, args.join(" "));
    assert.match(result.stderr, /^No chat server is registered with this machine's gateway\. /);
  }
});

/** What the scripted agent does with a message, by what it says. */
const byText = (message: Message): Outcome => {
  switch (message.text) {
    case "q1":
      return answered("a1");
    case "q2":
      return { status: "silent" };
    case "q3":
      return { status: "failed", detail: "the model\nrefused" };
    case "q4":
      return { status: "stopped" };
    default:
      return { status: "skipped" };
  }
};

test("read shows who said what and when, and a failed, stopped or skipped message, but not a silent one", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: byText });
  const thread = startedThread((await shrimpy(["run", "scout", "q1"])).stderr);
  for (const text of ["q2", "q3", "q4", "q5"]) await shrimpy(["run", "scout", text, "--thread", thread]);

  const result = await shrimpy(["read", thread]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(withoutTimes(linesOf(result.stdout)), [
    `Thread ${thread} in your DM with scout: q1`,
    "",
    `${you}  <time>`,
    "  q1",
    "",
    "scout  <time>",
    "  a1",
    "",
    `${you}  <time>`,
    "  q2",
    "",
    `${you}  <time>`,
    "  q3",
    "-- scout failed: the model refused --",
    "",
    `${you}  <time>`,
    "  q4",
    "-- scout stopped before answering --",
    "",
    `${you}  <time>`,
    "  q5",
    "-- scout skipped this message --",
  ]);
});

test("read --json prints the thread and every message with all its receipts, silent ones included", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: byText });
  const thread = startedThread((await shrimpy(["run", "scout", "q1"])).stderr);
  await shrimpy(["run", "scout", "q2", "--thread", thread]);

  const result = await shrimpy(["read", thread, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(linesOf(result.stdout).length, 1);
  const data = JSON.parse(result.stdout) as { thread: Thread; messages: Message[] };
  assert.equal(data.thread.id, thread);
  assert.deepEqual(data.messages.map((message) => message.text), ["q1", "a1", "q2"]);
  assert.deepEqual(data.messages[2]?.receipts, [{ memberId: "agent:scout", status: "silent", reply: null, detail: null }]);
  assert.equal(data.messages[0]?.receipts[0]?.status, "answered");
});

test("read says who is working in the thread now", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => finish.promise });
  const asked = await shrimpy(["run", "scout", "take your time", "--no-wait"]);
  const thread = /in thread (th_\w+)\./.exec(asked.stdout)?.[1] ?? "";
  await eventually(() => Promise.resolve(agent.offered.length), (offered) => offered === 1);
  const connection = await talking.you();
  await eventually(
    async () => (await connection.chat.threads(agent.offered[0]?.channelId ?? "")).find((x) => x.id === thread)?.working.length,
    (working) => working === 1,
  );

  const result = await shrimpy(["read", thread]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(withoutTimes(linesOf(result.stdout)).slice(-2), ["", "-- scout is working (since <time>) --"]);
  finish.resolve(answered("done"));
});

test("read of a thread that is not yours, or does not exist, says so and how to find yours", { timeout }, async (t) => {
  await startTalking(t);

  const result = await shrimpy(["read", "th_nowhere"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr.trim(),
    "Unknown thread: th_nowhere. See the threads of a conversation with: shrimpy threads <agent>",
  );
});

test("read of a thread with nothing in it says so", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const connection = await talking.you();
  const dm = await connection.chat.openDm(agentMember("scout"));
  const [main] = await connection.chat.threads(dm.id);

  const result = await shrimpy(["read", main?.id ?? ""]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(linesOf(result.stdout), [
    `Thread ${main?.id} in your DM with scout: (no messages yet) [main]`,
    "",
    "(no messages yet)",
  ]);
});

test("read goes back through a thread that is longer than the live view holds", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const connection = await talking.you();
  const dm = await connection.chat.openDm(agentMember("scout"));
  const [main] = await connection.chat.threads(dm.id);
  const thread = main?.id ?? "";
  for (let n = 0; n < 450; n++) await connection.chat.post(thread, `message ${n}`, `request-${n}`);

  const result = await shrimpy(["read", thread, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const { messages } = JSON.parse(result.stdout) as { messages: Message[] };
  assert.deepEqual(
    messages.map((message) => message.text),
    Array.from({ length: 450 }, (_, n) => `message ${n}`),
  );
  await untilRegistered("chat", "chat");
});
