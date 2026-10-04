import assert from "node:assert/strict";
import { test } from "node:test";
import { Chat, type ChatConnection } from "../contracts/chat/index.ts";
import { memberNamed } from "../contracts/chat/testing/index.ts";
import { connectLocalGateway, newToken } from "../contracts/gateway/node.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { eventually, offer, startStandIn, stopAfter, until, useRuntimeDir, within } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import {
  type Outcome,
  shrimpy,
  shrimpyInBackground,
  startScriptedAgent,
  startTalking,
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

/** The ID of the thread a `run` started, from the line it printed on standard error. */
function startedThread(stderr: string): string {
  const started = /^Thread (th_\w+) started\./m.exec(stderr);
  assert.ok(started?.[1], `no new thread was announced:\n${stderr}`);
  return started[1];
}

/** Your DM with scout, and the threads in it. */
async function scoutsThreads(you: ChatConnection) {
  const dm = (await you.chat.channels()).find((channel) => channel.members.some((m) => m.name === "scout"));
  assert.ok(dm, "there is no DM with scout");
  return { dm, threads: await you.chat.threads(dm.id) };
}

test("run posts to a new thread, prints the agent's reply, and puts the thread's ID on standard error", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const agent = await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => answered("Three emails.") });

  const result = await shrimpy(["run", "scout", "what is in my inbox?"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Three emails.\n");
  const thread = startedThread(result.stderr);
  const you = await talking.you();
  const { threads } = await scoutsThreads(you);
  assert.equal(threads.length, 2, "the DM has its main thread and the new one");
  assert.ok(threads.some((candidate) => candidate.id === thread && !candidate.main));
  const [asked, reply] = await you.chat.read(thread, null, 10);
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

test("the exit code says how the agent dealt with the message: 0 for an answer or for silence, 1 for a failure with its reason, 130 for stopped work", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, {
    name: "scout",
    chat: talking.chat.listening,
    handle: (message): Outcome => {
      if (message.text === "silent") return { status: "silent" };
      if (message.text === "fail") return { status: "failed", detail: "the model refused the request" };
      return message.text === "stop" ? { status: "stopped" } : { status: "answered", text: `ack: ${message.text}` };
    },
  });

  const quiet = await shrimpy(["run", "scout", "silent"]);
  const failed = await shrimpy(["run", "scout", "fail"]);
  const stopped = await shrimpy(["run", "scout", "stop"]);
  const answer = await shrimpy(["run", "scout", "reply"]);

  assert.deepEqual([quiet.code, quiet.stdout], [0, ""]);
  assert.deepEqual([failed.code, failed.stdout], [1, ""]);
  assert.match(failed.stderr, /the model refused the request/);
  assert.deepEqual([stopped.code, stopped.stdout], [130, ""]);
  assert.deepEqual([answer.code, answer.stdout], [0, "ack: reply\n"]);
});

test("--thread continues a thread, and a thread that is not in your DM with the agent gets nothing posted", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const agent = await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: (m) => answered(`ack: ${m.text}`) });
  const first = await shrimpy(["run", "scout", "first"]);
  const thread = startedThread(first.stderr);

  const second = await shrimpy(["run", "scout", "second", "--thread", thread]);
  const nowhere = await shrimpy(["run", "scout", "third", "--thread", "th_nowhere"]);

  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.stdout, "ack: second\n");
  const you = await talking.you();
  assert.deepEqual((await you.chat.read(thread, null, 10)).map((message) => message.text), [
    "first",
    "ack: first",
    "second",
    "ack: second",
  ]);
  assert.equal((await scoutsThreads(you)).threads.length, 2, "no new thread was made");
  assert.equal(nowhere.code, 1);
  assert.equal(nowhere.stdout, "");
  assert.equal(agent.offered.length, 2, "and the agent was offered nothing");
});

test("--no-wait exits once the message is posted and prints the IDs to follow up with", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => finish.promise });

  const result = await shrimpy(["run", "scout", "when you can", "--no-wait"]);

  assert.equal(result.code, 0, result.stderr);
  const posted = /Posted (msg_\w+) in thread (th_\w+)\./.exec(result.stdout);
  assert.ok(posted?.[1] && posted[2], result.stdout);
  const [messageId, thread] = [posted[1], posted[2]];
  const you = await talking.you();
  const [message] = await you.chat.read(thread, null, 10);
  assert.ok(message);
  assert.equal(message.id, messageId);
  assert.equal(message.text, "when you can");
  assert.deepEqual(message.receipts, [], "the agent has not finished, and the command did not wait for it");
  await until(() => agent.offered.length === 1, "the agent to be offered the message");
  finish.resolve(answered("done"));
  await eventually(() => you.chat.read(thread, null, 10), (messages) => messages[0]?.receipts.length === 1);
});

test("stopping run while it waits leaves the message and the agent's work alone, and exits 130", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => finish.promise });
  const waiting = shrimpyInBackground(["run", "scout", "take your time"]);
  await until(() => agent.offered.length === 1, "the agent to be offered the message");

  waiting.kill("SIGINT");
  const result = await waiting.finished;

  assert.equal(result.code, 130);
  assert.equal(result.stdout, "");
  const thread = startedThread(result.stderr);
  // The message is where it was, and the agent still finishes what it was doing.
  const you = await talking.you();
  finish.resolve(answered("done anyway"));
  const [message, reply] = await eventually(() => you.chat.read(thread, null, 10), (messages) => messages.length === 2);
  assert.ok(message && reply);
  assert.equal(message.text, "take your time");
  assert.equal(reply.text, "done anyway");
  assert.equal(message.receipts[0]?.status, "answered");
});

test("run says so when the chat server goes away while it waits, instead of waiting for nothing", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => finish.promise });
  const waiting = shrimpyInBackground(["run", "scout", "take your time"]);
  await until(() => agent.offered.length === 1, "the agent to be offered the message");
  await until(() => waiting.output().stderr.includes(" started."), "run to say which thread it started");

  await talking.chat.stop("SIGKILL");
  const result = await within(15_000, waiting.finished, "run ending");

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  const thread = startedThread(result.stderr);
  assert.ok(result.stderr.trim().split("\n").at(-1)?.includes(thread), "and the last thing it says is where the message is");
  finish.resolve(answered("too late"));
});

test("stopping run while its message is still being sent says it may have been posted, and exits 130", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startTestGateway(t);
  const sending = deferred<undefined>();
  const unsupported = (): Promise<never> => Promise.reject(new Error("this chat server only takes a post"));
  const scout = { id: "mem_scout", kind: "agent", name: "scout" } as const;
  const you = { id: "mem_you", kind: "person", name: "you" } as const;
  const channel = { id: "ch_one", kind: "dm", name: "scout", members: [scout, you] } as const;
  const thread = { id: "th_one", channelId: "ch_one", main: false, name: null, preview: null, archived: false, updatedAt: 0, working: [] };
  // A chat server that takes a post and never answers it.
  const chat = await startStandIn(t, "chat", {
    offer: () =>
      offer(Chat, {
        enter: () => Promise.resolve(you),
        channels: unsupported,
        openDm: () => Promise.resolve({ ...channel, members: [...channel.members] }),
        threads: unsupported,
        createThread: () => Promise.resolve(thread),
        renameThread: unsupported,
        archiveThread: unsupported,
        post: () => {
          sending.resolve(undefined);
          return new Promise(() => undefined);
        },
        edit: unsupported,
        delete: unsupported,
        react: unsupported,
        unreact: unsupported,
        read: unsupported,
        leaveReceipt: unsupported,
        setWorking: unsupported,
        head: unsupported,
        feed: unsupported,
        attach: unsupported,
        detach: unsupported,
      }),
  });
  const registrations = await connectLocalGateway();
  stopAfter(t, () => registrations.close());
  const program = { serverId: chat.serverId, socket: chat.socket, pid: process.pid, version: SHRIMPY_VERSION };
  await registrations.register({ kind: "chat", ...program });
  const agents = await connectLocalGateway();
  stopAfter(t, () => agents.close());
  await agents.join("scout", newToken());
  await agents.register({ kind: "agent", ...program });
  const waiting = shrimpyInBackground(["run", "scout", "hello"]);
  await sending.promise;

  waiting.kill("SIGINT");
  const result = await within(5000, waiting.finished, "run stopping");

  assert.equal(result.code, 130);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /may have been posted/);
});

test("with no gateway running it says what to start, and exits 1", { timeout }, async (t) => {
  useRuntimeDir(t);

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /shrimpy up/);
});

test("an agent that is not registered can't answer, so nothing is posted and it says what to start", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "rex", chat: talking.chat.listening, handle: () => answered("woof") });
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => answered("hi"), register: false });

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /shrimpy agent serve/);
  assert.deepEqual(await (await talking.you()).chat.channels(), [], "not even a DM was made");
});

test("a program of another version is named on standard error, and the command carries on", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => answered("hi"), version: "9.9.9" });

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "hi\n");
  assert.ok(result.stderr.includes("9.9.9") && result.stderr.includes(SHRIMPY_VERSION), result.stderr);
});
