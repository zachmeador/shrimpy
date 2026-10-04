import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Gateway, GATEWAY_SERVER_ID, GATEWAY_SOCKET_NAME } from "../contracts/gateway/index.ts";
import { startStandInGateway } from "../contracts/gateway/testing/index.ts";
import { Refusal } from "../lib/refusal/index.ts";
import { offer, startStandIn, tempDir, until, useRuntimeDir, within } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import {
  declareLocalModel,
  isAlive,
  launchUp,
  type ModelServer,
  serve,
  serveChat,
  serveGateway,
  shrimpy,
  startModelServer,
  startScriptedAgent,
  startUp,
  untilRegistered,
} from "./testing/index.ts";

/*
 * These tests start Shrimpy as people do: `shrimpy up` is its own process, and
 * so is every program it starts. Nothing here starts a real model turn except
 * the one test that needs an agent to be busy.
 */

const timeout = 90_000;

/** A test model, closed when the test ends. */
async function testModel(t: TestContext): Promise<ModelServer> {
  const model = await startModelServer();
  t.after(() => model.close());
  return model;
}

/** An agent home called `name`, set up to use the test model. */
async function agentHome(t: TestContext, model: ModelServer, name = "scout"): Promise<string> {
  const home = join(tempDir(t, "up-homes"), name);
  const init = await shrimpy(["agent", "init", home, "--name", name, "--model", "local/test-model"]);
  assert.equal(init.code, 0, init.stderr);
  declareLocalModel(home, { url: model.url, model: "test-model" });
  return home;
}

/** The lines `up` printed to standard output, with the process IDs in them left out. */
const withoutPids = (stdout: string): string[] => stdout.trimEnd().split("\n").map((line) => line.replace(/pid \d+/, "pid <pid>"));

test("up starts the gateway, the chat server and an agent per home, says how to reach them, and stops them in order", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  const data = join(tempDir(t, "up-data"), "chat");

  const up = await startUp(t, [home, "--data", data]);

  const [gateway, chat, agent] = up.programs();
  assert.ok(gateway && chat && agent);
  // A program says it is listening a moment before the gateway lists it.
  await untilRegistered("chat", "chat");
  assert.deepEqual(withoutPids(up.output().stdout), [
    "Started the gateway (pid <pid>).",
    `Started the chat server (pid <pid>), keeping its data in ${data}.`,
    `Started the agent scout (pid <pid>) from ${home}.`,
    "Running. Press Ctrl+C to stop what this command started.",
    'Talk to an agent with: shrimpy run scout "<text>"',
    "See what is running with: shrimpy gateway status",
  ]);
  const status = await shrimpy(["gateway", "status"]);
  assert.equal(status.code, 0, status.stderr);
  assert.match(status.stdout, new RegExp(`\\nchat +chat +${SHRIMPY_VERSION.replaceAll(".", "\\.")} +${chat}\\n`));
  await untilRegistered("agent", "scout");
  assert.match((await shrimpy(["gateway", "status"])).stdout, new RegExp(`\\nagent +scout +${SHRIMPY_VERSION.replaceAll(".", "\\.")} +${agent}\\n`));
  const agentStatus = JSON.parse((await shrimpy(["agent", "status", home])).stdout) as { running: boolean; pid: number };
  assert.deepEqual([agentStatus.running, agentStatus.pid], [true, agent]);
  assert.ok(existsSync(join(data, "state", "chat.sqlite")), "the chat server keeps its store in the data directory");

  up.kill("SIGTERM");
  const stopped = await up.finished;

  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(stopped.stderr, "");
  assert.deepEqual(withoutPids(stopped.stdout).slice(-2), [
    "Stopping what this command started. Another Ctrl+C stops without waiting.",
    "Everything this command started has stopped.",
  ]);
  assert.deepEqual([gateway, chat, agent].map(isAlive), [false, false, false]);
  assert.equal((await shrimpy(["gateway", "status"])).code, 1);
});

test("up stops agents first, gives a running turn the time agent serve does, and a second request skips the wait", { timeout }, async (t) => {
  const model = await testModel(t);
  const home = await agentHome(t, model);
  const up = await startUp(t, [home, "--data", tempDir(t, "up-data")]);
  const [gateway, chat, agent] = up.programs();
  assert.ok(gateway && chat && agent);
  await untilRegistered("agent", "scout");
  assert.equal((await shrimpy(["run", "scout", "go slow", "--no-wait"])).code, 0);
  await until(() => model.requests.length > 0, "the model to start answering");

  up.kill("SIGTERM");
  await delay(1000);

  // The agent is waiting for its turn, and the chat server and the gateway are left for after it.
  assert.equal(up.output().code, null, "up is still stopping");
  assert.deepEqual([agent, chat, gateway].map(isAlive), [true, true, true]);

  up.kill("SIGTERM");
  const stopped = await within(10_000, up.finished, "up stopping without waiting");

  assert.equal(stopped.code, 0, stopped.stderr);
  assert.deepEqual([agent, chat, gateway].map(isAlive), [false, false, false]);
});

test("a gateway that is already running is used as it is, and left running", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  const gateway = await serveGateway(t);

  const up = await startUp(t, [home, "--data", tempDir(t, "up-data")]);

  assert.equal(up.programs().length, 2, "only the chat server and the agent were started");
  assert.equal(withoutPids(up.output().stdout)[0], "The gateway is already running; using it as it is.");
  up.kill("SIGTERM");
  const stopped = await up.finished;
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.ok(isAlive(gateway.listening.pid), "the gateway was not started by up, so up leaves it");
  assert.equal(up.programs().some(isAlive), false);
  assert.equal((await shrimpy(["gateway", "status"])).code, 0);
});

test("a chat server that is already running is used as it is too", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-elsewhere"));

  const up = await startUp(t, [home, "--data", tempDir(t, "up-data")]);

  assert.deepEqual(withoutPids(up.output().stdout).slice(0, 3), [
    "The gateway is already running; using it as it is.",
    `The chat server is already running (pid <pid>); using it as it is.`,
    `Started the agent scout (pid <pid>) from ${home}.`,
  ]);
  assert.match(up.output().stdout, new RegExp(`The chat server is already running \\(pid ${chat.listening.pid}\\)`));
  up.kill("SIGINT");
  assert.equal((await up.finished).code, 0, "Ctrl+C stops it as SIGTERM does");
  assert.ok(isAlive(chat.listening.pid));
});

test("when everything is already running it starts nothing and exits at once", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  const gateway = await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  const agent = await serve(t, home);

  const up = await startUp(t, [home, "--data", tempDir(t, "up-data")]);

  const finished = await within(10_000, up.finished, "up ending");
  assert.equal(finished.code, 0, finished.stderr);
  assert.deepEqual(withoutPids(finished.stdout), [
    "The gateway is already running; using it as it is.",
    "The chat server is already running (pid <pid>); using it as it is.",
    `The agent at ${home} is already running (pid <pid>); using it as it is.`,
    "Everything is already running.",
  ]);
  assert.deepEqual(up.programs(), []);
  assert.deepEqual([gateway.listening.pid, chat.listening.pid, agent.listening.pid].map(isAlive), [true, true, true]);
});

test("a program that ends by itself takes the rest down, and up says which and exits 1", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  const up = await startUp(t, [home, "--data", tempDir(t, "up-data")]);
  const [gateway, chat, agent] = up.programs();
  assert.ok(gateway && chat && agent);

  process.kill(chat, "SIGKILL");
  const finished = await within(30_000, up.finished, "up ending");

  assert.equal(finished.code, 1);
  assert.equal(finished.stderr.trim(), "The chat server stopped by itself (signal SIGKILL), so the rest was stopped.");
  assert.deepEqual(withoutPids(finished.stdout).slice(-2), [
    "Stopping what this command started. Another Ctrl+C stops without waiting.",
    "Everything this command started has stopped.",
  ]);
  assert.deepEqual([gateway, chat, agent].map(isAlive), [false, false, false]);
});

test("a program that cannot start ends up with its own words, then stops what was started", { timeout }, async (t) => {
  useRuntimeDir(t);
  const notAHome = tempDir(t, "not-a-home");

  const finished = await shrimpy(["up", notAHome, "--data", tempDir(t, "up-data")]);

  assert.equal(finished.code, 1);
  assert.match(finished.stderr, /^\[agent .*\] .* is not an agent home/m);
  assert.match(finished.stderr, /Could not start the agent at .* \(exit code 1\)\.\n$/);
  const started = [...finished.stdout.matchAll(/^Started .* \(pid (\d+)\)/gm)].map((found) => Number(found[1]));
  assert.equal(started.length, 2, "the gateway and the chat server were started first");
  assert.deepEqual(started.map(isAlive), [false, false]);
});

test("up needs --data, and starts nothing without it", { timeout }, async (t) => {
  const runtime = useRuntimeDir(t);

  const missing = await shrimpy(["up", "some-home"]);
  const empty = await shrimpy(["up", "some-home", "--data", ""]);

  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /^Missing --data\.\nUsage: shrimpy up <home>\.\.\. --data <dir>\n$/);
  assert.equal(empty.code, 2);
  assert.match(empty.stderr, /^--data needs a directory\./);
  assert.deepEqual(readdirSync(runtime), []);
});

test("with no homes it starts the gateway and the chat server", { timeout }, async (t) => {
  const up = await startUp(t, ["--data", tempDir(t, "up-data")]);

  assert.equal(up.programs().length, 2);
  assert.ok(up.output().stdout.includes('Talk to an agent with: shrimpy run <agent> "<text>"'));
});

test("what up starts is what run talks through", { timeout }, async (t) => {
  const up = await startUp(t, ["--data", tempDir(t, "up-data")]);
  const chat = await untilRegistered("chat", "chat");
  await startScriptedAgent(t, { name: "scout", chat, handle: () => ({ status: "answered", text: "hello from scout" }) });

  const result = await shrimpy(["run", "scout", "hi"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "hello from scout\n");
  assert.equal(chat.pid, up.programs()[1], "the chat server it talked through is the one up started");
});

test("run right after up gets its reply from the agent up started, even one sent before the agent has joined chat", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  await startUp(t, [home, "--data", tempDir(t, "up-data")]);
  // The agent is registered before it has connected to chat, so this message can arrive first.
  await untilRegistered("agent", "scout");

  const result = await shrimpy(["run", "scout", "hi"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Hello from the test model.\n");
  assert.match(result.stderr, /^Thread th_\w+ started\. Continue it with: shrimpy run scout "<text>" --thread th_\w+\n$/);
});

test("each program's own lines carry its name, so they can be told apart", { timeout }, async (t) => {
  useRuntimeDir(t);
  // A gateway that is already there and takes no registrations makes the chat server say so.
  await startStandIn(t, GATEWAY_SOCKET_NAME, {
    serverId: GATEWAY_SERVER_ID,
    offer: () =>
      offer(Gateway, {
        register: () => Promise.reject(new Refusal("registrations are closed")),
        list: () => Promise.resolve([]),
        version: () => Promise.resolve(SHRIMPY_VERSION),
      }),
  });

  const up = await startUp(t, ["--data", tempDir(t, "up-data")]);

  await until(
    () => up.output().stderr.includes("[chat] [chat] Could not register with the gateway: registrations are closed\n"),
    "the chat server's complaint, with its name in front",
  );
});

test("a gateway of another version is named on standard error, and up carries on", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t, { version: "9.9.9" });

  const up = await startUp(t, ["--data", tempDir(t, "up-data")]);

  assert.ok(
    up.output().stderr.includes(
      `Warning: the gateway runs Shrimpy 9.9.9, but this command is ${SHRIMPY_VERSION}. Programs are meant to be upgraded together.\n`,
    ),
    up.output().stderr,
  );
  assert.equal(up.programs().length, 1, "the chat server was started");
});

test("a stop request while up is still starting stops what has started, and exits 0", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  const up = launchUp(t, [home, "--data", tempDir(t, "up-data")]);
  await until(() => up.output().stdout.includes("Started the gateway"), "the gateway to start", 30_000);

  up.kill("SIGTERM");
  const finished = await within(30_000, up.finished, "up ending");

  assert.equal(finished.code, 0, finished.stderr);
  assert.ok(finished.stdout.endsWith("Everything this command started has stopped.\n"), finished.stdout);
  assert.deepEqual(up.programs().map(isAlive).filter(Boolean), []);
  assert.equal((await shrimpy(["gateway", "status"])).code, 1);
});
