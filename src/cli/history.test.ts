import assert from "node:assert/strict";
import { test } from "node:test";
import type { Message, Thread } from "../contracts/chat/index.ts";
import { enterAsAgent, joinRoster, memberNamed } from "../contracts/chat/testing/index.ts";
import { eventually } from "../lib/testing/index.ts";
import { localTime } from "../lib/time/index.ts";
import { type Outcome, type Posted, shrimpy, startScriptedAgent, startTalking } from "./testing/index.ts";

/*
 * These tests look back at conversations as people do: every `shrimpy` is its
 * own process, and so are the gateway and the chat server. What the agent did
 * with each message is whatever a scripted member left as its receipt.
 */

const timeout = 60_000;
const THUMBS_UP = "\u{1F44D}";
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

const threadsOf = async (agent: string): Promise<Thread[]> =>
  JSON.parse((await shrimpy(["threads", agent, "--json"])).stdout) as Thread[];

test("threads lists your threads with an agent, the most recently updated first, archived ones included", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", handle: () => answered("ok") });
  const first = startedThread((await shrimpy(["run", "scout", "one"])).stderr);
  await shrimpy(["run", "scout", "two"]);
  await (await talking.you()).archive(first, true);

  const result = await shrimpy(["threads", "scout", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const threads = JSON.parse(result.stdout) as Thread[];
  assert.deepEqual(threads.map((thread) => thread.preview), ["two", "one"], "a thread with no name shows its first message");
  assert.deepEqual(threads.map((thread) => thread.archived), [false, true]);
});

test("threads says who is working in a thread right now, and stops saying so when they are done", { timeout }, async (t) => {
  await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", handle: () => finish.promise });
  const asked = await shrimpy(["run", "scout", "take your time", "--no-wait"]);
  const thread = /\b(th_\w+)/.exec(asked.stdout)?.[1] ?? "";
  await eventually(() => Promise.resolve(agent.offered.length), (offered) => offered === 1);
  const workingIn = async (): Promise<string[]> =>
    (await threadsOf("scout")).find((candidate) => candidate.id === thread)?.working.map((mark) => mark.memberId) ?? [];

  await eventually(workingIn, (working) => working.length === 1);
  assert.deepEqual(await workingIn(), [(await memberNamed(t, "scout")).id]);

  finish.resolve(answered("done"));
  await eventually(workingIn, (working) => working.length === 0);
});

test("threads with an agent you never talked to lists nothing and makes nothing", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await joinRoster(t, "rex");

  const result = await shrimpy(["threads", "rex", "--json"]);
  const nobody = await shrimpy(["threads", "nobody"]);
  const yourself = await shrimpy(["threads", (await talking.you()).me.name]);

  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), []);
  assert.deepEqual(await (await talking.you()).channels(), []);
  assert.equal(nobody.code, 1, "while nobody on the roster is an error");
  assert.equal(yourself.code, 1, "and so are you");
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

test("read shows where an agent failed, stopped or skipped a message, and not where it was silent", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", handle: byText });
  const thread = startedThread((await shrimpy(["run", "scout", "q1"])).stderr);
  for (const text of ["q2", "q3", "q4", "q5"]) await shrimpy(["run", "scout", text, "--thread", thread]);

  const result = await shrimpy(["read", thread]);

  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.split("\n");
  // What follows a message is the blank line before the next one, unless a line about it comes first.
  const after = (text: string): string => lines[lines.findIndex((line) => line.trim() === text) + 1] ?? "";
  for (const text of ["q1", "a1", "q2", "q3", "q4", "q5"]) assert.ok(lines.some((line) => line.trim() === text), text);
  assert.deepEqual([after("q1"), after("q2")], ["", ""], "an answer is the message that follows, and the silent receipt is shown to nobody");
  assert.ok(after("q3").includes("the model refused"), after("q3"));
  assert.notEqual(after("q4"), "");
  assert.notEqual(after("q5"), "");

  // Shown to nobody is what the reader chooses. The silent receipt is an event in the feed like the others.
  const feed = await (await talking.you()).events(0, 100);
  assert.deepEqual(
    feed.flatMap((event) => (event.kind === "receipted" ? [event.status] : [])),
    ["answered", "silent", "failed", "stopped", "skipped"],
  );
});

test("read shows a thread of a DM between two agents, which the person is not in", { timeout }, async (t) => {
  await startTalking(t);
  const scout = await enterAsAgent(t, "scout");
  const maya = await enterAsAgent(t, "maya");
  const dm = await scout.openDm(maya.me.id);
  const main = await scout.createThread(dm.id, null);
  await scout.post(main.id, "Is the disk full?", "scout-1");
  await maya.post(main.id, "Nearly.", "maya-1");

  const result = await shrimpy(["read", main.id]);

  assert.equal(result.code, 0, result.stderr);
  const lines = result.stdout.split("\n");
  for (const text of ["Is the disk full?", "Nearly."]) assert.ok(lines.some((line) => line.trim() === text), text);
  const header = lines[0] ?? "";
  assert.ok(header.includes("maya") && header.includes("scout"), header);
});

/** What a terminal acts on, or a reader can be misled by: control characters but the line break, and those that reorder text. */
const ACTED_ON = new RegExp("[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]");

test("read prints what another member wrote with nothing a terminal would act on", { timeout }, async (t) => {
  await startTalking(t);
  const scout = await enterAsAgent(t, "scout");
  const maya = await enterAsAgent(t, "maya");
  const dm = await scout.openDm(maya.me.id);
  const main = await scout.createThread(dm.id, null);
  const text = "\u001b]0;not your title\u0007\u001b[31mred\u001b[0m, \u001b]52;c;cHduZWQ=\u0007a carriage\rreturn and ‮turned";
  await scout.post(main.id, text, "scout-1");

  const result = await shrimpy(["read", main.id]);
  const data = JSON.parse((await shrimpy(["read", main.id, "--json"])).stdout) as { messages: Message[] };

  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, ACTED_ON);
  assert.ok(result.stdout.includes("red"), "what is meant to be seen is still there");
  assert.equal(data.messages[0]?.text, text);
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

test("read shows each message as it now stands, by its ID", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", handle: () => answered("Noted.") });
  const thread = startedThread((await shrimpy(["run", "scout", "first draft"])).stderr);
  const you = await talking.you();
  const [asked, reply] = await you.read(thread, null, 10);
  assert.ok(asked && reply);
  const read = async (): Promise<string[]> => (await shrimpy(["read", thread])).stdout.split("\n");
  const lineOf = (lines: string[], message: Message): string => lines.find((line) => line.includes(message.id)) ?? "";

  const before = await read();
  assert.ok(lineOf(before, asked).includes(asked.author.name) && lineOf(before, reply).includes(reply.author.name));
  const { editedAt } = await you.edit(asked.id, "second draft");
  await you.react(reply.id, THUMBS_UP);

  const edited = await read();
  assert.ok(edited.some((line) => line.trim() === "second draft"));
  assert.ok(!edited.some((line) => line.trim() === "first draft"));
  assert.ok(editedAt !== null && lineOf(edited, asked).includes(localTime(editedAt)), "with when it was edited");
  assert.ok(edited.some((line) => line.trim() === `${THUMBS_UP} ${you.me.name}`));

  await you.unreact(reply.id, THUMBS_UP);
  await you.delete(asked.id);

  const deleted = await read();
  assert.notEqual(lineOf(deleted, asked), "", "a deleted message is still listed");
  assert.ok(!deleted.some((line) => line.includes("second draft") || line.includes(THUMBS_UP)));
});

test("read goes back through a thread that is longer than the live view holds", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const connection = await talking.you();
  const dm = await connection.openDm((await joinRoster(t, "scout")).id);
  const thread = (await connection.createThread(dm.id, null)).id;
  for (let n = 0; n < 450; n++) await connection.post(thread, `message ${n}`, `request-${n}`);

  const result = await shrimpy(["read", thread, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const { messages } = JSON.parse(result.stdout) as { messages: Message[] };
  assert.deepEqual(
    messages.map((message) => message.text),
    Array.from({ length: 450 }, (_, n) => `message ${n}`),
  );
});
