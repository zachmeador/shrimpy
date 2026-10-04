import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { startChat } from "../chat/index.ts";
import { agentMember, Chat, type ChatConnection, personMember } from "../contracts/chat/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { startStandInGateway } from "../contracts/gateway/testing/index.ts";
import {
  eventually,
  offer,
  startStandIn,
  stopAfter,
  tempDir,
  until,
  useRuntimeDir,
  within,
} from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import {
  type Outcome,
  serveChat,
  serveGateway,
  shrimpy,
  shrimpyInBackground,
  startScriptedAgent,
  startTalking,
  untilRegistered,
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
  const started = /^Thread (th_\w+) started\. Continue it with: shrimpy run scout "<text>" --thread \1$/m.exec(stderr);
  assert.ok(started?.[1], `no new thread was announced:\n${stderr}`);
  return started[1];
}

/** Your DM with scout, and the threads in it. */
async function scoutsThreads(you: ChatConnection) {
  const dm = (await you.chat.channels()).find((channel) => channel.members.some((m) => m.id === "agent:scout"));
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
  assert.equal(result.stderr.trim().split("\n").length, 1);
  const you = await talking.you();
  const { threads } = await scoutsThreads(you);
  assert.equal(threads.length, 2, "the DM has its main thread and the new one");
  assert.ok(threads.some((candidate) => candidate.id === thread && !candidate.main));
  const [asked, reply] = await you.chat.read(thread, null, 10);
  assert.ok(asked && reply);
  assert.equal(asked.text, "what is in my inbox?");
  assert.equal(asked.author.id, `person:${userInfo().username}`);
  assert.equal(reply.author.id, "agent:scout");
  assert.deepEqual(asked.receipts, [{ memberId: "agent:scout", status: "answered", reply: reply.id, detail: null }]);
  assert.equal(agent.offered.length, 1);
});

test("a reply that ends in a line break is printed with one", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => answered("one\ntwo\n") });

  const result = await shrimpy(["run", "scout", "count"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "one\ntwo\n");
});

test("an agent that stays silent prints nothing and exits 0", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => ({ status: "silent" }) });

  const result = await shrimpy(["run", "scout", "thanks, bye"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "");
  startedThread(result.stderr);
});

test("a failure prints the receipt's reason on standard error and exits 1", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, {
    name: "scout",
    chat: talking.chat.listening,
    handle: () => ({ status: "failed", detail: "the model refused the request" }),
  });

  const result = await shrimpy(["run", "scout", "do it"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /\nscout failed: the model refused the request\n$/);
});

for (const [status, said] of [
  ["stopped", "scout stopped before answering your message."],
  ["skipped", "scout skipped your message."],
] as const) {
  test(`work that was ${status} says so on standard error and exits 130`, { timeout }, async (t) => {
    const talking = await startTalking(t);
    await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => ({ status }) });

    const result = await shrimpy(["run", "scout", "do it"]);

    assert.equal(result.code, 130);
    assert.equal(result.stdout, "");
    assert.ok(result.stderr.endsWith(`\n${said}\n`), result.stderr);
  });
}

test("--thread continues a thread, and says nothing of threads when it does", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: (m) => answered(`ack: ${m.text}`) });
  const first = await shrimpy(["run", "scout", "first"]);
  const thread = startedThread(first.stderr);

  const second = await shrimpy(["run", "scout", "second", "--thread", thread]);

  assert.equal(second.code, 0, second.stderr);
  assert.equal(second.stdout, "ack: second\n");
  assert.equal(second.stderr, "");
  const you = await talking.you();
  assert.deepEqual((await you.chat.read(thread, null, 10)).map((message) => message.text), [
    "first",
    "ack: first",
    "second",
    "ack: second",
  ]);
  assert.equal((await scoutsThreads(you)).threads.length, 2, "no new thread was made");
});

test("--thread for a thread that is not in your DM with the agent posts nothing", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const agent = await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => answered("hi") });

  const result = await shrimpy(["run", "scout", "hello", "--thread", "th_nowhere"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "There is no thread th_nowhere in your DM with scout. List yours with: shrimpy threads scout");
  const you = await talking.you();
  const { threads } = await scoutsThreads(you);
  assert.deepEqual(threads.map((thread) => thread.preview), [null]);
  assert.deepEqual(agent.offered, []);
});

test("--no-wait exits once the message is posted and prints the IDs to follow up with", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => finish.promise });

  const result = await shrimpy(["run", "scout", "when you can", "--no-wait"]);

  assert.equal(result.code, 0, result.stderr);
  const posted = /^Posted (msg_\w+) in thread (th_\w+)\. Read it with: shrimpy read \2\n$/.exec(result.stdout);
  assert.ok(posted?.[1] && posted[2], result.stdout);
  const [messageId, thread] = [posted[1], posted[2]];
  assert.equal(result.stderr, "");
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
  assert.ok(
    result.stderr.endsWith(
      `Stopped waiting. Your message is in thread ${thread}, and scout's work on it goes on. Read the thread with: shrimpy read ${thread}\n`,
    ),
    result.stderr,
  );
  // The message is where it was, and the agent still finishes what it was doing.
  const you = await talking.you();
  finish.resolve(answered("done anyway"));
  const [message, reply] = await eventually(() => you.chat.read(thread, null, 10), (messages) => messages.length === 2);
  assert.ok(message && reply);
  assert.equal(message.text, "take your time");
  assert.equal(reply.text, "done anyway");
  assert.equal(message.receipts[0]?.status, "answered");
});

test("run says so when the thread moves on past its message, instead of waiting for nothing", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const finish = deferred<Outcome>();
  const agent = await startScriptedAgent(t, {
    name: "scout",
    chat: talking.chat.listening,
    handle: (message) => (message.text.startsWith("chatter") ? { status: "silent" } : finish.promise),
  });
  const waiting = shrimpyInBackground(["run", "scout", "take your time"]);
  await until(() => agent.offered.length === 1, "the agent to be offered the message");
  const you = await talking.you();
  const thread = agent.offered[0]?.threadId ?? "";

  for (let n = 0; n < 205; n++) await you.chat.post(thread, `chatter ${n}`, `chatter-${n}`);
  const result = await waiting.finished;

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /\nThe thread has moved on past your message, so what scout did with it can't be followed from here\. Read the thread with: shrimpy read th_\w+\n$/);
  finish.resolve(answered("late"));
});

test("stopping run while the gateway is not answering says nothing was sent, and exits 130", { timeout }, async (t) => {
  const gateway = await serveGateway(t);
  process.kill(gateway.listening.pid, "SIGSTOP");
  const waiting = shrimpyInBackground(["run", "scout", "hello"]);
  // Long enough for it to have connected to the gateway and be waiting for its answer.
  await delay(500);

  waiting.kill("SIGINT");
  const result = await within(5000, waiting.finished, "run stopping");

  assert.equal(result.code, 130);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Stopped before anything was sent.\n");
});

test("stopping run while its message is still being sent says it may have been posted, and exits 130", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t);
  const sending = deferred<undefined>();
  const unsupported = (): Promise<never> => Promise.reject(new Error("this chat server only takes a post"));
  const channel = { id: "ch_one", kind: "dm", name: "scout", members: [agentMember("scout"), personMember("you")] } as const;
  const thread = { id: "th_one", channelId: "ch_one", main: false, name: null, preview: null, archived: false, updatedAt: 0, working: [] };
  // A chat server that takes a post and never answers it.
  const chat = await startStandIn(t, "chat", {
    offer: () =>
      offer(Chat, {
        identify: () => Promise.resolve(),
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
  await registrations.register({ kind: "chat", name: "chat", ...program });
  const agents = await connectLocalGateway();
  stopAfter(t, () => agents.close());
  await agents.register({ kind: "agent", name: "scout", ...program });
  const waiting = shrimpyInBackground(["run", "scout", "hello"]);
  await sending.promise;

  waiting.kill("SIGINT");
  const result = await within(5000, waiting.finished, "run stopping");

  assert.equal(result.code, 130);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Stopped while your message was being sent. It may have been posted; check with: shrimpy threads scout\n");
});

test("a chat server that is registered but not there is named with where it was looked for", { timeout }, async (t) => {
  const runtime = useRuntimeDir(t);
  await startStandInGateway(t);
  const gateway = await connectLocalGateway();
  stopAfter(t, () => gateway.close());
  const socket = join(runtime, "nowhere.sock");
  await gateway.register({ kind: "chat", name: "chat", serverId: randomUUID(), socket, pid: process.pid, version: SHRIMPY_VERSION });

  const result = await shrimpy(["threads", "scout"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.startsWith(`Could not reach the chat server at ${socket}: `), result.stderr);
});

test("with no gateway running it says what to start, and exits 1", { timeout }, async (t) => {
  useRuntimeDir(t);

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "No gateway is running on this machine. Start Shrimpy with: shrimpy up <home>... --data <dir>");
});

test("with a gateway but no chat server it says what to start, and exits 1", { timeout }, async (t) => {
  await serveGateway(t);

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 1);
  assert.equal(
    result.stderr.trim(),
    "No chat server is registered with this machine's gateway. Start one with: shrimpy chat serve <data-dir>, or start everything with: shrimpy up <home>... --data <dir>",
  );
});

test("an agent that is not registered can't answer, so nothing is posted and it says what to start", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "rex", chat: talking.chat.listening, handle: () => answered("woof") });
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => answered("hi"), register: false });

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr.trim(),
    "No agent named scout is registered with this machine's gateway. Registered agents: rex. Start it with: shrimpy agent serve <home>, or start everything with: shrimpy up <home>... --data <dir>",
  );
  assert.deepEqual(await (await talking.you()).chat.channels(), [], "not even a DM was made");
});

test("a program of another version is named on standard error, and the command carries on", { timeout }, async (t) => {
  const talking = await startTalking(t);
  await startScriptedAgent(t, { name: "scout", chat: talking.chat.listening, handle: () => answered("hi"), version: "9.9.9" });

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "hi\n");
  assert.ok(
    result.stderr.includes(
      `Warning: the agent scout runs Shrimpy 9.9.9, but this command is ${SHRIMPY_VERSION}. Programs are meant to be upgraded together.\n`,
    ),
    result.stderr,
  );
});

test("a gateway of another version is named too", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t, { version: "9.9.9" });
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  await untilRegistered("chat", "chat");
  await startScriptedAgent(t, { name: "scout", chat: chat.listening, handle: () => answered("hi") });

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "hi\n");
  assert.ok(result.stderr.includes("Warning: the gateway runs Shrimpy 9.9.9, but this command is"), result.stderr);
});

test("a chat server of another version is named too", { timeout }, async (t) => {
  useRuntimeDir(t);
  await serveGateway(t);
  const chat = await startChat({ dataDir: tempDir(t, "chat-data") });
  stopAfter(t, () => chat.close());
  const gateway = await connectLocalGateway();
  stopAfter(t, () => gateway.close());
  await gateway.register({ kind: "chat", name: "chat", ...chat.endpoint, version: "9.9.9" });
  await startScriptedAgent(t, { name: "scout", chat: chat.endpoint, handle: () => answered("hi") });

  const result = await shrimpy(["run", "scout", "hello"]);

  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stderr.includes("Warning: the chat server runs Shrimpy 9.9.9, but this command is"), result.stderr);
});
