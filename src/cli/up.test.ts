import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { saveMembership } from "../contracts/agent/node.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { tempDir, until, useRuntimeDir, within } from "../lib/testing/index.ts";
import {
  declareLocalModel,
  freeAddresses,
  isAlive,
  launchUp,
  type ModelServer,
  serve,
  serveChat,
  serveGateway,
  shrimpy,
  startModelServer,
  startUp,
  untilRegistered,
  useShrimpyDir,
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

/** The agent `name` in the Shrimpy folder, set up to use the test model. */
async function agentInFolder(t: TestContext, model: ModelServer, name: string): Promise<string> {
  const init = await shrimpy(["agent", "init", name, "--model", "local/test-model"]);
  assert.equal(init.code, 0, init.stderr);
  const home = join(useShrimpyDir(t), "agents", name);
  declareLocalModel(home, { url: model.url, model: "test-model" });
  return home;
}

test("up starts the gateway, the chat server and an agent per home, says how to reach them, and stops them", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  const data = tempDir(t, "up-data");

  const up = await startUp(t, [home, "--data", data]);

  const [gateway, chat, agent] = up.programs();
  assert.ok(gateway && chat && agent);
  // A program says it is listening a moment before the gateway lists it.
  await untilRegistered("chat", "chat");
  await untilRegistered("agent", "scout");
  assert.ok(up.output().stdout.includes('shrimpy run scout "<text>"'), "it says how to talk to the agent");
  const agentStatus = JSON.parse((await shrimpy(["agent", "status", "--agent", home])).stdout) as { running: boolean; pid: number };
  assert.deepEqual([agentStatus.running, agentStatus.pid], [true, agent]);
  assert.ok(existsSync(join(data, "chat", "state", "chat.sqlite")), "the chat server keeps its store in a folder of its own");
  assert.ok(existsSync(join(data, "gateway", "state", "roster.json")), "and the gateway its roster");

  up.kill("SIGTERM");
  const stopped = await up.finished;

  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(stopped.stderr, "");
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

test("a gateway and a chat server that are already running are used as they are, and left running", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  const gateway = await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-elsewhere"));

  const up = await startUp(t, [home, "--data", tempDir(t, "up-data")]);

  assert.equal(up.programs().length, 1, "only the agent was started");
  up.kill("SIGINT");
  const stopped = await up.finished;
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.deepEqual([gateway.listening.pid, chat.listening.pid].map(isAlive), [true, true], "up leaves what it did not start");
  assert.equal(up.programs().some(isAlive), false);
});

test("when everything is already running it starts nothing and exits at once", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  const gateway = await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  const agent = await serve(t, home);

  const up = await startUp(t, [home, "--data", tempDir(t, "up-data")]);

  const finished = await within(10_000, up.finished, "up ending");
  assert.equal(finished.code, 0, finished.stderr);
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
  assert.match(finished.stderr, /chat server/i);
  assert.deepEqual([gateway, chat, agent].map(isAlive), [false, false, false]);
});

test("a program that cannot start ends up with its own words, then stops what was started", { timeout }, async (t) => {
  useRuntimeDir(t);
  const notAHome = tempDir(t, "not-a-home");

  const finished = await shrimpy(["up", notAHome, "--data", tempDir(t, "up-data")]);

  assert.equal(finished.code, 1);
  assert.match(finished.stderr, /is not an agent home/);
  const started = [...finished.stdout.matchAll(/^Started .* \(pid (\d+)\)/gm)].map((found) => Number(found[1]));
  assert.equal(started.length, 2, "the gateway and the chat server were started first");
  assert.deepEqual(started.map(isAlive), [false, false]);
});

test("up with no arguments starts every agent in the Shrimpy folder, and keeps the gateway's and the chat server's data there", { timeout }, async (t) => {
  const model = await testModel(t);
  const folder = useShrimpyDir(t);
  const scout = await agentInFolder(t, model, "scout");
  await agentInFolder(t, model, "rex");
  // A folder of agents/ with no agent.json in it is not an agent.
  mkdirSync(join(folder, "agents", "notes"));

  const up = await startUp(t, []);

  assert.equal(up.programs().length, 4, "the gateway, the chat server and the two agents");
  await untilRegistered("agent", "scout");
  await untilRegistered("agent", "rex");
  const status = JSON.parse((await shrimpy(["agent", "status", "--agent", "scout"])).stdout) as { home: string };
  assert.equal(status.home, scout, "an agent is reached by its name");
  assert.equal((await shrimpy(["sessions", "list", "--agent", "rex"])).code, 0, "and so are its sessions");
  assert.ok(existsSync(join(folder, "gateway", "state", "roster.json")), "the gateway keeps its roster in the folder");
  assert.ok(existsSync(join(folder, "chat", "state", "chat.sqlite")), "and the chat server its store");

  up.kill("SIGTERM");
  const stopped = await up.finished;

  assert.equal(stopped.code, 0, stopped.stderr);
  assert.deepEqual(up.programs().map(isAlive), [false, false, false, false]);
});

test("run right after up gets its reply from the agent up started, even one sent before the agent has joined chat", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  await startUp(t, [home, "--data", tempDir(t, "up-data")]);
  // The agent is registered before it has connected to chat, so this message can arrive first.
  await untilRegistered("agent", "scout");

  const result = await shrimpy(["run", "scout", "hi"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Hello from the test model.\n");
});

test("a stop request while up is still starting stops what has started, and exits 0", { timeout }, async (t) => {
  const home = await agentHome(t, await testModel(t));
  const up = launchUp(t, [home, "--data", tempDir(t, "up-data")]);
  await until(() => up.output().stdout.includes("Started the gateway"), "the gateway to start", 30_000);

  up.kill("SIGTERM");
  const finished = await within(30_000, up.finished, "up ending");

  assert.equal(finished.code, 0, finished.stderr);
  assert.deepEqual(up.programs().map(isAlive).filter(Boolean), []);
  assert.equal((await shrimpy(["gateway", "status"])).code, 1);
});

test("up starts no gateway or chat server for agents that all belong to a gateway elsewhere, unless it is told to listen, and starts them beside its own when only some do", { timeout }, async (t) => {
  const model = await testModel(t);
  const [elsewhere] = await freeAddresses(["127.0.0.1"]);
  assert.ok(elsewhere);
  const scout = await agentHome(t, model, "scout");
  const rex = await agentHome(t, model, "rex");
  // Rex joined a gateway that is somewhere else, and nothing answers there now, so it keeps trying.
  saveMembership(rex, { token: newToken(), gateway: elsewhere });
  // Each start has a data directory of its own, so that what one gateway kept is not another's to listen on.
  const data = (): string => tempDir(t, "up-data");

  const alone = await startUp(t, [rex, "--data", data()]);
  assert.equal(alone.programs().length, 1, "rex alone");
  assert.equal((await shrimpy(["gateway", "status"])).code, 1, "and no gateway is running here");
  alone.kill("SIGTERM");
  assert.equal((await alone.finished).code, 0);

  const told = await startUp(t, [rex, "--data", data(), "--listen", "127.0.0.1:0"]);
  assert.equal(told.programs().length, 3, "the gateway and the chat server too, since it was told to listen");
  told.kill("SIGTERM");
  assert.equal((await told.finished).code, 0);

  const mixed = await startUp(t, [rex, scout, "--data", data()]);
  assert.equal(mixed.programs().length, 4, "the gateway, the chat server and both agents");
  mixed.kill("SIGTERM");
  assert.equal((await mixed.finished).code, 0);
});
