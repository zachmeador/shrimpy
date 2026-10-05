import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { SessionView } from "../contracts/agent/index.ts";
import type { Message, Receipt } from "../contracts/chat/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { eventually, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import {
  captureIo,
  declareLocalModel,
  type ModelServer,
  serveChat,
  startModelServer,
  talkTo,
  untilRegistered,
} from "./testing/index.ts";

const timeout = 60_000;

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out, err: cli.err };
}

interface ServedHome {
  home: string;
  model: ModelServer;
  /** The ID of the main thread of Zach's DM with the agent. */
  threadId: string;
  /** Zach says something in the thread, and the message is returned once the agent has left its receipt on it. */
  ask: (text: string) => Promise<Message>;
  /** Zach says something in the thread, and the message is returned at once. */
  tell: (text: string) => Promise<Message>;
  /** The receipt the agent leaves on a message, once it has. */
  receiptOn: (message: Message) => Promise<Receipt>;
  /** Stop the agent as one SIGTERM would, and resolve with the exit code of `agent serve`. */
  stop: () => Promise<number>;
  /** Stop it as two would: without waiting for running turns. */
  stopNow: () => Promise<number>;
}

/**
 * A home that talks to the test model, with its agent serving in this process
 * (`agent serve <home> ...serveFlags`) and finding the chat server, which runs
 * in a process of its own, through a gateway. All of it stops when the test
 * ends.
 */
async function servedHome(t: TestContext, ...serveFlags: string[]): Promise<ServedHome> {
  useRuntimeDir(t);
  const model = await startModelServer();
  await startTestGateway(t);
  await serveChat(t, tempDir(t, "chat-data"));
  await untilRegistered("chat", "chat");
  const home = join(tempDir(t, "flow"), "scout");
  assert.equal((await run("agent", "init", home, "--name", "scout", "--model", "local/test-model")).code, 0);
  declareLocalModel(home, { url: model.url, model: "test-model" });

  const serving = captureIo();
  const done = runCli(["agent", "serve", home, ...serveFlags], serving.io);
  const stop = (): Promise<number> => {
    serving.requestStop();
    return done;
  };
  const stopNow = (): Promise<number> => {
    serving.requestStop();
    return stop();
  };
  t.after(async () => {
    await stopNow();
    await model.close();
  });
  await Promise.race([
    serving.nextOut((line) => line.includes('"event":"listening"')),
    done.then((code) => {
      throw new Error(`agent serve ended with ${code}: ${serving.err.join("\n")}`);
    }),
  ]);
  const talk = await talkTo(t, "scout");

  const ask = async (text: string): Promise<Message> => {
    const said = await talk.say(text);
    await talk.receiptOn(said);
    return said;
  };
  return { home, model, threadId: talk.thread.id, ask, tell: (text) => talk.say(text), receiptOn: (message) => talk.receiptOn(message), stop, stopNow };
}

test("agent reload makes the running agent read its home again, and says what it left out", { timeout }, async (t) => {
  const { home, model, ask } = await servedHome(t);
  const requestRoles = (index: number): string[] =>
    (model.requests[index]?.body.messages ?? []).filter((message) => message.role !== "system").map((message) => message.role);
  const told = (index: number): string => String(model.requests[index]?.body.messages[0]?.content);
  await ask("hello");
  writeFileSync(join(home, "SOUL.md"), "Answer in rhyme.\n");
  writeFileSync(join(home, "context", "team.md"), "The team is small.\n");
  mkdirSync(join(home, "skills", "broken"));
  writeFileSync(join(home, "skills", "broken", "SKILL.md"), "# no front matter\n");
  await ask("hello again");
  assert.doesNotMatch(told(1), /Answer in rhyme\./, "nothing changes until the agent is told to read again");

  const reloaded = await run("agent", "reload", "--agent", home);

  assert.equal(reloaded.code, 0, reloaded.err.join("\n"));
  assert.ok(reloaded.out.join("\n").includes("skills/broken/SKILL.md"), "the file it left out is named");
  await ask("and once more");
  assert.match(told(2), /Answer in rhyme\./);
  assert.match(told(2), /The team is small\./);
  assert.deepEqual(requestRoles(2), ["user", "assistant", "user", "assistant", "user"], "and what the session held is still there");
});

test("stopping the work makes the waiting command exit 130, and the message in the thread is marked stopped", { timeout }, async (t) => {
  const { home, model, threadId, ask, tell, receiptOn } = await servedHome(t);
  await ask("first");

  const waiting = run("sessions", "steer", threadId, "go slow", "--wait", "--agent", home);
  await until(() => model.requests.length > 1, "the model to start answering");
  const stopped = await run("sessions", "stop", threadId, "--agent", home);
  const result = await waiting;

  assert.equal(stopped.code, 0);
  assert.equal(result.code, 130);
  assert.deepEqual(result.out, []);
  // The agent is still there, and can be asked again.
  assert.equal((await run("sessions", "steer", threadId, "hello", "--wait", "--agent", home)).code, 0);
  const slow = await tell("go slow, in the thread");
  await until(() => model.requests.length > 3, "the model to start on the thread's message");
  assert.equal((await run("sessions", "stop", threadId, "--agent", home)).code, 0);
  assert.equal((await receiptOn(slow)).status, "stopped");
});

test("input the model refuses makes the waiting command exit 1, with the reason", { timeout }, async (t) => {
  const { home, threadId, ask } = await servedHome(t);
  await ask("first");

  const result = await run("sessions", "steer", threadId, "please refuse", "--wait", "--agent", home);

  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
  assert.match(result.err.join("\n"), /The test model refuses this request\./);
});

test("a waiting command exits 1 when the agent stops under it", { timeout }, async (t) => {
  const { home, model, threadId, ask, stopNow } = await servedHome(t);
  await ask("first");
  const waiting = run("sessions", "steer", threadId, "go slow", "--wait", "--agent", home);
  await until(() => model.requests.length > 1, "the model to start answering");

  assert.equal(await stopNow(), 0);
  const result = await waiting;

  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
  assert.equal(result.err.length, 1);
});

test("with the gateway gone, the agent is still watched and stopped by its home's path, and tells chat what became of the message once the gateway is back", { timeout }, async (t) => {
  const { home, model, threadId, ask, tell } = await servedHome(t);
  const gateway = await startTestGateway(t);
  await ask("first");
  const slow = await tell("go slow, in the thread");
  await until(() => model.requests.length > 1, "the model to start on the thread's message");

  await gateway.outage();

  const watched = await run("sessions", "read", threadId, "--json", "--agent", home);
  assert.equal(watched.code, 0, watched.err.join("\n"));
  assert.equal((JSON.parse(watched.out[0] ?? "{}") as SessionView).status.busy, true, "it is at work");
  assert.equal((await run("sessions", "stop", threadId, "--agent", home)).code, 0);

  await gateway.recover();
  const statusOf = async (): Promise<string | undefined> => {
    const read = await run("read", threadId, "--json");
    if (read.code !== 0) return undefined;
    const { messages } = JSON.parse(read.out[0] ?? "{}") as { messages: Message[] };
    return messages.find((message) => message.id === slow.id)?.receipts[0]?.status;
  };
  assert.equal(await eventually(statusOf, (status) => status !== undefined, { what: "the agent's receipt", timeoutMs: 40_000 }), "stopped");
});

test("--now stops the agent without waiting for the running turn", { timeout }, async (t) => {
  const { home, model, threadId, ask, stop } = await servedHome(t, "--now");
  await ask("first");
  const waiting = run("sessions", "steer", threadId, "go slow", "--wait", "--agent", home);
  await until(() => model.requests.length > 1, "the model to start answering");

  // The test model streams for ten seconds, and a stop that waits would give the turn five of them.
  const started = Date.now();
  assert.equal(await stop(), 0);
  assert.ok(Date.now() - started < 3000, `stopping took ${Date.now() - started} ms`);
  assert.equal((await waiting).code, 1);
});
