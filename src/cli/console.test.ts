import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { type ConsoleScreen, openConsole } from "../clients/console/index.ts";
import type { SessionStatus } from "../contracts/agent/index.ts";
import type { Message, Thread } from "../contracts/chat/index.ts";
import { memberNamed, startTestChat } from "../contracts/chat/testing/index.ts";
import { gatewaySocket } from "../contracts/gateway/node.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { listen } from "../lib/link/node.ts";
import { eventually, FakeTerminal, stopAfter, tempDir, until, useRuntimeDir, within } from "../lib/testing/index.ts";
import { localTime } from "../lib/time/index.ts";
import { PI_PACKAGES, SHRIMPY_VERSION } from "../lib/version/index.ts";
import { openTheConsole } from "./run.ts";
import {
  agentHome,
  launchUp,
  openConsoleOn,
  type Outcome,
  serve,
  shrimpy,
  startModelServer,
  startScriptedAgent,
  startTalking,
  untilLinked,
} from "./testing/index.ts";

/*
 * These tests open the console from the command line, as `shrimpy` does at a
 * terminal, against the programs `shrimpy up` starts as processes of their own:
 * the gateway, the chat server and an agent on a test model. Only the terminal
 * is a stand-in, one a test types into and reads what was drawn from.
 */

const timeout = 90_000;
const CTRL_C = "\u0003";
const CTRL_N = "\u000e";
const DOWN = "\u001b[B";
const ENTER = "\r";
const LEFT = "\u001b[D";
const CTRL_HOME = "\u001b[1;5H";
const TAB = "\t";

/** Open the console the way a bare `shrimpy` at a terminal does, on a terminal of our own. It is left when the test ends. */
const openOn = (t: TestContext, terminal: FakeTerminal) => openConsoleOn(t, terminal, openTheConsole);

/** The agent's screen, once it knows everything it lists: what the console goes to when one agent is running. */
const agentsScreen = (screen: ConsoleScreen): boolean => screen.kind === "threads" && screen.ofAgent && screen.settled;

/** Wait until what was drawn includes `text`. */
const seen = (terminal: FakeTerminal, text: string, what = text, timeoutMs = 30_000): Promise<void> =>
  until(() => terminal.text().includes(text), `the console to show ${what}`, timeoutMs);

/** Wait until what was drawn after the first `from` characters includes `text`. */
const seenAfter = (terminal: FakeTerminal, from: number, text: string, what = text, timeoutMs = 30_000): Promise<void> =>
  until(() => terminal.text().slice(from).includes(text), `the console to show ${what}`, timeoutMs);

/** Your threads with scout, as `threads --json` lists them. */
const threadsWithScout = async (): Promise<Thread[]> => JSON.parse((await shrimpy(["threads", "scout", "--json"])).stdout) as Thread[];

/** The ID of your thread with scout that starts with `text`, once it is there. */
async function threadStartedWith(text: string): Promise<string> {
  const threads = await eventually(threadsWithScout, (listed) => listed.some((thread) => thread.preview === text), {
    what: `the thread that starts with "${text}"`,
  });
  const found = threads.find((thread) => thread.preview === text);
  assert.ok(found);
  return found.id;
}

/** The messages of a thread, as `read --json` gives them, or none while it can't be read. */
async function messagesOf(thread: string): Promise<Message[]> {
  const read = await shrimpy(["read", thread, "--json"]);
  if (read.code !== 0) return [];
  return (JSON.parse(read.stdout) as { messages: Message[] }).messages;
}

/**
 * Up with one agent, scout, on the test model, and the console open on a terminal of the test's own, on scout's
 * screen, which it goes to since scout is the only agent. Left when the test ends.
 */
async function consoleWithScout(t: TestContext) {
  const model = await startModelServer(t);
  const home = await agentHome(t, model);
  const up = launchUp(t, [home, "--data", tempDir(t, "console-data")]);
  await up.until(untilLinked("chat", "chat"));
  await up.until(untilLinked("agent", "scout"));
  // Wide enough that every level is on show at once.
  const terminal = new FakeTerminal(200, 40);
  const { exited, untilScreen } = openOn(t, terminal);
  await untilScreen(agentsScreen, "scout's screen");
  return { home, model, terminal, exited, untilScreen };
}

/** Leave the console with Ctrl+C twice, and wait for it to be left. */
async function leave(terminal: FakeTerminal, exited: Promise<number>): Promise<void> {
  terminal.type(CTRL_C);
  terminal.type(CTRL_C);
  assert.equal(await within(30_000, exited, "the console to be left"), 0);
}

test("a bare shrimpy at a terminal opens the console, to talk, watch the work, stop it and leave it working", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const home = await agentHome(t, model);
  const up = launchUp(t, [home, "--data", tempDir(t, "console-data")]);
  await up.until(untilLinked("chat", "chat"));
  await up.until(untilLinked("agent", "scout"));
  const terminal = new FakeTerminal(100, 40);
  const { cli, exited, untilScreen } = openOn(t, terminal);

  // One agent is running, so it goes straight to that agent's screen.
  await untilScreen(agentsScreen, "scout's screen");

  // A new thread, and a message in it: the thread is made with the message, and the reply comes back into it.
  terminal.type(CTRL_N);
  terminal.type("hi there");
  terminal.type(ENTER);
  await seen(terminal, "Hello from the test model.", "the agent's reply");
  await threadStartedWith("hi there");

  // Another thread, with work that goes on: its answer streams beside the conversation until the person writes /stop.
  terminal.type(CTRL_N);
  terminal.type("go slow");
  terminal.type(ENTER);
  await seen(terminal, "word3", "the answer streaming");
  await seen(terminal, "/stop", "who is working, and how to stop it");
  terminal.type("/stop");
  terminal.type(ENTER);
  const slow = await threadStartedWith("go slow");
  await eventually(() => messagesOf(slow), (messages) => messages[0]?.receipts[0]?.status === "stopped", { what: "the message to be marked stopped" });

  // And once more, left working: leaving says so, and how to stop it.
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
  const thread = await threadStartedWith("go slow again");
  const [line = ""] = cli.out;
  assert.ok(line.includes(`shrimpy sessions stop ${thread} --agent scout`), line);
  const stopped = await shrimpy(["sessions", "stop", thread, "--agent", "scout"]);
  assert.equal(stopped.code, 0, stopped.stderr);
});

test("the gateway killed while an agent works: the reply is posted once, and the console picks it up by itself", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const home = await agentHome(t, model);
  const gateway = await startTestGateway(t);
  await startTestChat(t);
  await untilLinked("chat", "chat");
  await serve(t, home);
  await untilLinked("agent", "scout");
  const terminal = new FakeTerminal(100, 40);
  const { exited, untilScreen } = openOn(t, terminal);
  await untilScreen(agentsScreen, "scout's screen");
  terminal.type(CTRL_N);
  terminal.type("go slow");
  terminal.type(ENTER);
  await seen(terminal, "word3", "the answer streaming");
  const thread = await threadStartedWith("go slow");

  await gateway.outage();

  // The agent goes on without it, and says by its home's path when the turn is over. The reply waits in the task that follows its event.
  await eventually(
    async () => {
      const read = await shrimpy(["sessions", "read", thread, "--json", "--agent", home]);
      return read.code === 0 ? (JSON.parse(read.stdout) as { status: SessionStatus }).status.busy : undefined;
    },
    (busy) => busy === false,
    { what: "the agent to finish the turn without the gateway", timeoutMs: 40_000 },
  );
  await gateway.recover();

  // Every link pauses longer after each failure, up to 15 seconds, so the programs find each other again within a minute.
  await seen(terminal, "word200", "the reply, in the console that nobody touched", 60_000);
  const repliesOf = async (): Promise<Message[]> => (await messagesOf(thread)).filter((message) => message.author.name === "scout");
  const posted = await eventually(repliesOf, (replies) => replies.length > 0, { what: "the reply to be posted", timeoutMs: 60_000 });
  assert.equal(posted.length, 1);
  // A message after it is answered after anything the agent had left to post there.
  const next = await shrimpy(["run", "scout", "hi", "--thread", thread]);
  assert.equal(next.code, 0, next.stderr);
  assert.deepEqual((await repliesOf()).map((reply) => reply.text.startsWith("word1 ")), [true, false], "and it is not posted again");

  terminal.type(CTRL_C);
  terminal.type(CTRL_C);
  assert.equal(await within(30_000, exited, "the console to be left"), 0);
});

test("a thread of a room is read, written in and watched like one of a DM", { timeout }, async (t) => {
  const talking = await startTalking(t);
  let finish: (outcome: Outcome) => void = () => undefined;
  const working = new Promise<Outcome>((resolve) => {
    finish = resolve;
  });
  const scout = await startScriptedAgent(t, { name: "scout", handle: () => working });
  const you = await talking.you();
  const room = await you.createRoom("ops", [(await memberNamed(t, "scout")).id]);
  const disk = await you.createThread(room.id, "the disk");
  const terminal = new FakeTerminal(100, 40);
  const { exited, untilScreen } = openOn(t, terminal);
  // A test that fails must not leave the agent working.
  stopAfter(t, () => finish({ status: "silent" }));

  // With an agent and a room to choose from, the person chooses, and is not taken to the agent.
  await untilScreen((screen) => screen.kind === "agents", "the first screen");
  await seen(terminal, "#ops");
  terminal.type(DOWN);
  terminal.type(ENTER);
  await seen(terminal, "the disk", "the room's threads");
  terminal.type(ENTER);

  // What the person writes is posted in the room's thread, and the agent that is offered it is seen working.
  terminal.type("is the disk full?");
  terminal.type(ENTER);
  await seen(terminal, "/stop", "who is working");
  const [posted] = await eventually(() => you.read(disk.id, null, 10), (messages) => messages.length === 1, {
    what: "the message to be posted in the room",
  });
  assert.ok(posted);
  assert.equal(posted.text, "is the disk full?");
  assert.equal(posted.author.id, you.me.id);
  assert.deepEqual(scout.offered.map((offered) => offered.text), ["is the disk full?"]);

  // What the agent says in it arrives as it does in a DM.
  finish({ status: "answered", text: "The disk is fine." });
  await seen(terminal, "The disk is fine.", "the agent's reply");

  // A new thread is made in the room, with its first message.
  terminal.type(CTRL_N);
  terminal.type("and the backups?");
  terminal.type(ENTER);
  const [side] = await eventually(
    async () => (await you.threads(room.id)).filter((thread) => !thread.main && thread.id !== disk.id),
    (threads) => threads.length === 1,
    { what: "another thread in the room" },
  );
  assert.ok(side);
  const [first] = await eventually(() => you.read(side.id, null, 10), (messages) => messages.length > 0, {
    what: "its first message",
  });
  assert.equal(first?.text, "and the backups?");

  terminal.type(CTRL_C);
  terminal.type(CTRL_C);
  assert.equal(await within(30_000, exited, "the console to be left"), 0);
});

test("the agent's view of a long turn shows its start, read back from where the session's window starts", { timeout }, async (t) => {
  const { terminal, exited } = await consoleWithScout(t);
  terminal.type(CTRL_N);

  // Thirty tool calls, each its own answer and result, make far more entries than a session's window holds.
  terminal.type("count to thirty");
  terminal.type(ENTER);
  await seen(terminal, "Counted to thirty.", "the agent's answer", 60_000);
  const before = terminal.text().length;
  terminal.type(TAB);
  await seenAfter(terminal, before, "Counted to thirty.", "the agent's view, at its end");
  // The whole screen shows the end of what is on show, and the top of it is a key away.
  terminal.type(CTRL_HOME);

  await seenAfter(terminal, before, "step-01", "the turn's first call, from before the window");
  await leave(terminal, exited);
});

test("why a turn failed reads the same in its receipt and /status, and a wake-up shows in both", { timeout }, async (t) => {
  const { home, terminal, exited } = await consoleWithScout(t);
  terminal.type(CTRL_N);

  terminal.type("please refuse");
  terminal.type(ENTER);
  const thread = await threadStartedWith("please refuse");
  const [refused] = await eventually(() => messagesOf(thread), (messages) => messages[0]?.receipts[0]?.status === "failed", {
    what: "the failed receipt",
  });
  const detail = refused?.receipts[0]?.detail;
  assert.ok(detail);
  // A thread keeps to a measure that reads well, so a long sentence wraps, and its start is on one line.
  const why = detail.slice(0, 40);
  await seen(terminal, why, "why the turn failed, under the message");
  let before = terminal.text().length;
  terminal.type("/status");
  terminal.type(ENTER);
  await seenAfter(terminal, before, why, "why the last turn failed, in /status");

  terminal.type("check back later");
  terminal.type(ENTER);
  await seen(terminal, "I will check back later.", "the agent's answer");
  const read = await shrimpy(["sessions", "read", thread, "--json", "--agent", home]);
  const [wakeup] = (JSON.parse(read.stdout) as { status: SessionStatus }).status.wakeups;
  assert.ok(wakeup);
  // Beside the thread it says the time of day, and /status says the whole time.
  await seen(terminal, new Date(wakeup.due).toTimeString().slice(0, 5), "the wake-up beside the thread");
  before = terminal.text().length;
  terminal.type("/status");
  terminal.type(ENTER);
  await seenAfter(terminal, before, localTime(wakeup.due), "the wake-up in /status");
  await leave(terminal, exited);
});

test("the list of agents shows where an agent works when that is none of the person's threads", { timeout }, async (t) => {
  const { home, terminal, exited } = await consoleWithScout(t);
  const added = await shrimpy(["triggers", "add", "nightly", "--every", "1h", "go slow", "--agent", home]);
  assert.equal(added.code, 0, added.stderr);
  const fired = await shrimpy(["triggers", "run", "nightly", "--agent", home]);
  assert.equal(fired.code, 0, fired.stderr);
  await seen(terminal, "nightly", "the trigger's session on scout's screen");

  const before = terminal.text().length;
  terminal.type(LEFT);
  await seenAfter(terminal, before, "nightly", "scout's row on the list of agents");
  const stopped = await shrimpy(["sessions", "stop", "trigger:nightly", "--agent", home]);
  assert.equal(stopped.code, 0, stopped.stderr);
  await leave(terminal, exited);
});

test("a console that cannot start says why, exits with 1, and leaves nothing running", { timeout }, async (t) => {
  // A gateway answers, so there is nothing to set up first.
  await startTestGateway(t);
  const terminal = new FakeTerminal(100, 40);
  terminal.start = () => {
    throw new Error("The terminal could not be set up.");
  };
  const { cli, exited } = openOn(t, terminal);

  assert.equal(await within(30_000, exited, "the console to give up"), 1);
  assert.deepEqual(cli.err, ["The terminal could not be set up."]);
});

test("a stop request, as SIGTERM is, leaves the console as the keys do", { timeout }, async (t) => {
  await startTestGateway(t);
  const terminal = new FakeTerminal(100, 40);
  const { cli, exited, untilScreen } = openOn(t, terminal);
  await untilScreen((screen) => screen.kind === "agents", "the first screen");

  cli.requestStop();

  assert.equal(await within(30_000, exited, "the console to be left"), 0);
  assert.equal(terminal.stopped, true);
});

test("a console the gateway turns away for a newer release offers that release, and Enter installs it", { timeout }, async (t) => {
  useRuntimeDir(t);
  const [major = 0] = SHRIMPY_VERSION.split(/[.-]/).map(Number);
  const newer = `${String(major + 1)}.0.0`;
  const gateway = await listen({ path: gatewaySocket() }, () => ({
    answer: { kind: "refused", words: "Another major.", reason: null, shrimpy: newer, pi: PI_PACKAGES },
  }));
  stopAfter(t, () => gateway.close());
  const asked: string[] = [];
  const terminal = new FakeTerminal();
  const { exited } = openConsoleOn(t, terminal, (io, stand) =>
    openConsole({ io, update: (version) => Promise.resolve(asked.push(version) + 6), ...stand }),
  );

  await seen(terminal, newer, "the offer of the gateway's release");
  terminal.type(ENTER);

  assert.equal(await within(30_000, exited, "the console to be left"), 7, "the update's exit code is the command's");
  assert.deepEqual(asked, [newer]);
  assert.equal(terminal.stopped, true);
});
