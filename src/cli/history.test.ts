import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message, Thread } from "../contracts/chat/index.ts";
import { joinRoster, memberNamed } from "../contracts/chat/testing/index.ts";
import { eventually } from "../lib/testing/index.ts";
import { type Outcome, type Posted, shrimpy, startScriptedAgent, startTalking } from "./testing/index.ts";

/*
 * These tests look back at conversations as people do: every `shrimpy` is its
 * own process, and so are the gateway and the chat server. What the agent did
 * with each message is whatever a scripted member left as its receipt.
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

/** The ID of the thread a `run` started, from the line it printed on standard error. */
function startedThread(stderr: string): string {
  const started = /^Thread (th_\w+) started\./m.exec(stderr);
  assert.ok(started?.[1], `no new thread was announced:\n${stderr}`);
  return started[1];
}

const threadsOf = async (agent: string): Promise<Thread[]> =>
  JSON.parse((await shrimpy(["threads", agent, "--json"])).stdout) as Thread[];

test("threads lists your threads with an agent, the most recently updated first, archived ones included", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", handle: () => answered("ok") });
  const first = startedThread((await shrimpy(["run", "scout", "one"])).stderr);
  await shrimpy(["run", "scout", "two"]);
  await (await talking.you()).chat.archiveThread(first, true);

  const result = await shrimpy(["threads", "scout", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const threads = JSON.parse(result.stdout) as Thread[];
  assert.deepEqual(threads.map((thread) => thread.preview), ["two", "one", null], "a thread with no name shows its first message");
  assert.deepEqual(threads.map((thread) => thread.main), [false, false, true]);
  assert.deepEqual(threads.map((thread) => thread.archived), [false, true, false]);
});

test("threads says who is working in a thread right now, and stops saying so when they are done", { timeout }, async (t) => {
  await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", handle: () => finish.promise });
  const asked = await shrimpy(["run", "scout", "take your time", "--no-wait"]);
  const thread = /in thread (th_\w+)\./.exec(asked.stdout)?.[1] ?? "";
  await eventually(() => Promise.resolve(agent.offered.length), (offered) => offered === 1);
  const workingIn = async (): Promise<string[]> =>
    (await threadsOf("scout")).find((candidate) => candidate.id === thread)?.working.map((mark) => mark.memberId) ?? [];

  await eventually(workingIn, (working) => working.length === 1);
  assert.deepEqual(await workingIn(), [(await memberNamed(t, "scout")).id]);

  finish.resolve(answered("done"));
  await eventually(workingIn, (working) => working.length === 0);
});

test("threads with an agent you have never talked to lists nothing, and makes nothing, and with nobody on the roster or with yourself it says so", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await joinRoster(t, "rex");

  const result = await shrimpy(["threads", "rex", "--json"]);
  const nobody = await shrimpy(["threads", "nobody"]);
  const yourself = await shrimpy(["threads", (await talking.you()).me.name]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
  assert.deepEqual(await (await talking.you()).chat.channels(), []);
  assert.equal(nobody.code, 1);
  assert.match(nobody.stderr, /Nobody called nobody is on this machine's roster/);
  assert.equal(yourself.code, 1);
  assert.match(yourself.stderr, /is you/);
});

/** What the scripted agent does with a message, by what it says. */
const byText = (message: Posted): Outcome => {
  switch (message.text) {
    case "q1":
      return answered("a1");
    case "q2":
      return { status: "silent" };
    case "q3":
      return { status: "failed", detail: "the model refused" };
    case "q4":
      return { status: "stopped" };
    default:
      return { status: "skipped" };
  }
};

test("read shows who said what, and where an agent failed, stopped or skipped a message, but not where it was silent, which chat offers all the same", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", handle: byText });
  const thread = startedThread((await shrimpy(["run", "scout", "q1"])).stderr);
  for (const text of ["q2", "q3", "q4", "q5"]) await shrimpy(["run", "scout", text, "--thread", thread]);

  const result = await shrimpy(["read", thread]);

  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.split("\n");
  const noteAfter = (text: string): string | undefined => lines[lines.findIndex((line) => line.trim() === text) + 1];
  for (const text of ["q1", "a1", "q2", "q3", "q4", "q5"]) assert.ok(lines.some((line) => line.trim() === text), text);
  assert.match(noteAfter("q3") ?? "", /the model refused/);
  assert.match(noteAfter("q4") ?? "", /stopped/);
  assert.match(noteAfter("q5") ?? "", /skipped/);
  assert.equal(lines.filter((line) => line.startsWith("--")).length, 3, "the silent receipt is shown to nobody");

  // Shown to nobody is what the reader chooses. The silent receipt is an event in the feed like the others.
  const feed = await (await talking.you()).chat.feed(0, 100);
  assert.deepEqual(
    feed.flatMap((event) => (event.kind === "receipted" ? [event.status] : [])),
    ["answered", "silent", "failed", "stopped", "skipped"],
  );
});

test("read --json prints the thread and every message with all its receipts, silent ones included", { timeout }, async (t) => {
  await startTalking(t);
  await startScriptedAgent(t, { name: "scout", handle: byText });
  const scout = await memberNamed(t, "scout");
  const thread = startedThread((await shrimpy(["run", "scout", "q1"])).stderr);
  await shrimpy(["run", "scout", "q2", "--thread", thread]);

  const result = await shrimpy(["read", thread, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const data = JSON.parse(result.stdout) as { thread: Thread; messages: Message[] };
  assert.equal(data.thread.id, thread);
  assert.deepEqual(data.messages.map((message) => message.text), ["q1", "a1", "q2"]);
  assert.deepEqual(data.messages[2]?.receipts, [
    { memberId: scout.id, event: data.messages[2]?.event, status: "silent", reply: null, detail: null },
  ]);
  assert.equal(data.messages[0]?.receipts[0]?.status, "answered");
});

test("read goes back through a thread that is longer than the live view holds", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const connection = await talking.you();
  const dm = await connection.chat.openDm((await joinRoster(t, "scout")).id);
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
});
