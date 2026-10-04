import assert from "node:assert/strict";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { openConsole } from "../clients/console/index.ts";
import type { Message, Thread } from "../contracts/chat/index.ts";
import { eventually, stopAfter, tempDir, until, useRuntimeDir, within } from "../lib/testing/index.ts";
import { runCli } from "./index.ts";
import {
  captureIo,
  declareLocalModel,
  FakeTerminal,
  type ModelServer,
  serve,
  serveChat,
  serveGateway,
  shrimpy,
  startModelServer,
  startUp,
  untilRegistered,
} from "./testing/index.ts";

/*
 * These tests open the console from the command line, as `shrimpy` does at a
 * terminal, against the programs `shrimpy up` starts as processes of their own:
 * the gateway, the chat server and an agent on a test model. Only the terminal
 * is a stand-in, one a test types into and reads what was drawn from.
 */

const timeout = 90_000;
const ESC = "\u001b";
const CTRL_C = "\u0003";
const CTRL_N = "\u000e";
const ENTER = "\r";

async function testModel(t: TestContext): Promise<ModelServer> {
  const model = await startModelServer();
  t.after(() => model.close());
  return model;
}

/** An agent home called scout, set up to use the test model. */
async function agentHome(t: TestContext, model: ModelServer): Promise<string> {
  const home = join(tempDir(t, "console-home"), "scout");
  const init = await shrimpy(["agent", "init", home, "--name", "scout", "--model", "local/test-model"]);
  assert.equal(init.code, 0, init.stderr);
  declareLocalModel(home, { url: model.url, model: "test-model" });
  return home;
}

/** Open the console the way a bare `shrimpy` at a terminal does, on a terminal of our own. */
function openOn(terminal: FakeTerminal) {
  const cli = captureIo({ terminal: true });
  const exited = runCli([], cli.io, {
    openConsole: (io) => openConsole({ io, terminal, pollMs: 100 }),
  });
  return { cli, exited };
}

/** Wait until what was drawn includes `text`. */
const seen = (terminal: FakeTerminal, text: string, what = text, timeoutMs = 30_000): Promise<void> =>
  until(() => terminal.text().includes(text), `the console to show ${what}`, timeoutMs);

test("a bare shrimpy at a terminal opens the console, in which a person can see the agent, talk, watch the work, stop it and leave it working", { timeout }, async (t) => {
  const model = await testModel(t);
  const home = await agentHome(t, model);
  await startUp(t, [home, "--data", tempDir(t, "console-data")]);
  await untilRegistered("chat", "chat");
  await untilRegistered("agent", "scout");
  const terminal = new FakeTerminal();
  const { cli, exited } = openOn(terminal);

  // One agent is running, so it goes straight to that agent, whom the person has not talked to yet.
  await seen(terminal, "scout · your threads");
  await seen(terminal, "You have not talked to scout yet. Press n to start a thread.");

  // A new thread, and a message in it: the thread is made with the message, and the reply comes back into it.
  terminal.type("n");
  await seen(terminal, "New thread with scout. Type below to start it.");
  terminal.type("hi there");
  terminal.type(ENTER);
  await seen(terminal, "Hello from the test model.", "the agent's reply");
  const threads = await shrimpy(["threads", "scout"]);
  assert.match(threads.stdout, /hi there/);

  // Another thread, with work that goes on: its answer streams beside the conversation until the person stops it.
  terminal.type(CTRL_N);
  terminal.type("go slow");
  terminal.type(ENTER);
  await seen(terminal, "word3", "the answer streaming");
  await seen(terminal, "scout is working", "who is working");
  terminal.type(ESC);
  await seen(terminal, "Stopped scout's work in this thread.");
  await seen(terminal, "-- scout stopped before answering --", "what the agent did with the message");

  // And once more, left working: leaving says so, and says how to stop it.
  const before = terminal.text().length;
  terminal.type(CTRL_N);
  terminal.type("go slow again");
  terminal.type(ENTER);
  await until(() => terminal.text().slice(before).includes("word3"), "the answer to stream again", 30_000);
  terminal.type(CTRL_C);
  terminal.type(CTRL_C);
  const code = await within(30_000, exited, "the console to be left");

  assert.equal(code, 0);
  assert.equal(terminal.stopped, true);
  assert.equal(cli.out.length, 1);
  const [line] = cli.out;
  assert.match(line ?? "", /^scout is still working in thread th_\w+, and the work continues\. /);
  const thread = /thread (th_\w+)/.exec(line ?? "")?.[1];
  assert.ok(thread);
  const stopped = await shrimpy(["sessions", "stop", home, thread]);
  assert.equal(stopped.code, 0, stopped.stderr);
});

test("the gateway killed while an agent works: the turn finishes, its reply is posted once when the gateway is back, and the console picks everything up by itself", { timeout }, async (t) => {
  const model = await testModel(t);
  const home = await agentHome(t, model);
  const data = tempDir(t, "console-gateway");
  const gateway = await serveGateway(t, [], data);
  await serveChat(t, tempDir(t, "console-chat"));
  await untilRegistered("chat", "chat");
  await serve(t, home);
  await untilRegistered("agent", "scout");
  const terminal = new FakeTerminal();
  const { cli, exited } = openOn(terminal);
  // A test that fails must not leave the console open, or its process never ends.
  stopAfter(t, async () => {
    cli.requestStop();
    await exited.catch(() => undefined);
  });
  await seen(terminal, "You have not talked to scout yet. Press n to start a thread.");
  terminal.type("n");
  await seen(terminal, "New thread with scout. Type below to start it.");
  terminal.type("go slow");
  terminal.type(ENTER);
  await seen(terminal, "word3", "the answer streaming");
  const listed = JSON.parse((await shrimpy(["threads", "scout", "--json"])).stdout) as Thread[];
  const thread = listed.find((candidate) => !candidate.main)?.id;
  assert.ok(thread, "the thread the console started");

  await gateway.stop("SIGKILL");

  // The agent goes on without it, and says by its home's path when the turn is over. The reply waits in its outbox.
  const sessions = await eventually(
    () => shrimpy(["sessions", "list", home]),
    (result) => result.stdout.includes(`${thread} `) && result.stdout.includes("idle"),
    { what: "the agent to finish the turn without the gateway", timeoutMs: 40_000 },
  );
  assert.equal(sessions.code, 0, sessions.stderr);
  await serveGateway(t, [], data);

  // Every link pauses longer after each failure, up to 15 seconds, so the programs find each other again within a minute.
  await seen(terminal, "word200", "the reply, in the console that nobody touched", 60_000);
  const repliesOf = async (): Promise<Message[]> => {
    const read = await shrimpy(["read", thread, "--json"]);
    if (read.code !== 0) return [];
    return (JSON.parse(read.stdout) as { messages: Message[] }).messages.filter((message) => message.author.name === "scout");
  };
  const posted = await eventually(repliesOf, (replies) => replies.length > 0, { what: "the reply to be posted", timeoutMs: 60_000 });
  assert.equal(posted.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  assert.equal((await repliesOf()).length, 1, "and it is not posted again");

  terminal.type(CTRL_C);
  terminal.type(CTRL_C);
  assert.equal(await within(30_000, exited, "the console to be left"), 0);
});

test("a console that cannot start says why, exits with 1, and leaves nothing running", { timeout }, async (t) => {
  useRuntimeDir(t);
  const terminal = new FakeTerminal();
  terminal.start = () => {
    throw new Error("The terminal could not be set up.");
  };
  const { cli, exited } = openOn(terminal);

  assert.equal(await within(30_000, exited, "the console to give up"), 1);
  assert.deepEqual(cli.err, ["The terminal could not be set up."]);
});

test("a stop request, as SIGTERM is, leaves the console as the keys do", { timeout }, async (t) => {
  useRuntimeDir(t);
  const terminal = new FakeTerminal();
  const { cli, exited } = openOn(terminal);
  await seen(terminal, "Agents");

  cli.requestStop();

  assert.equal(await within(30_000, exited, "the console to be left"), 0);
  assert.equal(terminal.stopped, true);
});
