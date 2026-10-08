import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { saveMembership } from "../contracts/agent/node.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { tempDir, until, useRuntimeDir, within } from "../lib/testing/index.ts";
import type { Pace } from "./commands/index.ts";
import {
  declareLocalModel,
  freeAddresses,
  isAlive,
  launchUp,
  type ModelServer,
  type RunningUp,
  serve,
  serveChat,
  serveGateway,
  shrimpy,
  startModelServer,
  startUp,
  startUpWithPace,
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

/*
 * Following the folder: `up` with no agents named keeps the homes of the Shrimpy folder running. These run it with
 * pauses of the test's own, in this process, and everything it starts is a process of its own.
 */

/** Looking and starting again as fast as a test can wait for. */
const quick: Pace = { lookMs: 100, pauseMs: 100, longestPauseMs: 400, stableMs: 1_000 };

/** The process ID `up` last said it started `what` with: "the gateway", "the chat server", "the agent scout". */
function startedPid(up: RunningUp, what: string): number {
  const found = [...up.output().stdout.matchAll(new RegExp(`^Started ${what} \\(pid (\\d+)\\)`, "gm"))].at(-1);
  assert.ok(found?.[1] !== undefined, `up did not say it started ${what}:\n${up.output().stdout}`);
  return Number(found[1]);
}

/** The process ID the agent called `agent` answers with, as `shrimpy agent status` says. */
async function pidOfAgent(agent: string): Promise<number> {
  return (JSON.parse((await shrimpy(["agent", "status", "--agent", agent])).stdout) as { pid: number }).pid;
}

test("a home made while up runs is started by itself and joins the roster, nothing that was running is started again, and a home taken away has its agent stopped", { timeout }, async (t) => {
  const model = await testModel(t);
  const folder = useShrimpyDir(t);
  await agentInFolder(t, model, "scout");
  const up = await startUpWithPace(t, [], quick);
  const before = ["the gateway", "the chat server", "the agent scout"].map((what) => startedPid(up, what));
  await untilRegistered("agent", "scout");

  // The home is whole when it appears, as one is that is finished elsewhere and moved in.
  renameSync(await agentHome(t, model, "rex"), join(folder, "agents", "rex"));
  await untilRegistered("agent", "rex");

  assert.equal(up.programs().length, 4, "only the agent of the new home was started");
  assert.deepEqual(before.map(isAlive), [true, true, true]);
  assert.equal(await pidOfAgent("scout"), before[2], "scout is the process it was");
  const said = await shrimpy(["run", "rex", "hi"]);
  assert.equal(said.stdout, "Hello from the test model.\n", said.stderr);

  const rex = startedPid(up, "the agent rex");
  renameSync(join(folder, "agents", "rex"), join(tempDir(t, "taken-away"), "rex"));
  await until(() => !isAlive(rex), "the agent of the home that was taken away to stop", 30_000);
  assert.match(up.output().stdout, /The home at .*rex is gone, so the agent rex \(pid \d+\) is stopped\./);
  assert.deepEqual(before.map(isAlive), [true, true, true], "while the rest runs on");
  assert.equal(up.output().code, null);

  up.kill("SIGTERM");
  const stopped = await up.finished;
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.deepEqual(up.programs().map(isAlive), [false, false, false, false]);
});

test("an agent that is killed is started again alone and answers, while the gateway, the chat server and the other agent keep their processes, and a chat server that ends still takes everything down", { timeout }, async (t) => {
  const model = await testModel(t);
  await agentInFolder(t, model, "scout");
  await agentInFolder(t, model, "rex");
  const up = await startUpWithPace(t, [], quick);
  const [gateway, chat, scout, rex] = ["the gateway", "the chat server", "the agent scout", "the agent rex"].map((what) =>
    startedPid(up, what),
  );
  assert.ok(gateway && chat && scout && rex);
  await untilRegistered("agent", "scout");

  process.kill(scout, "SIGKILL");
  await until(() => startedPid(up, "the agent scout") !== scout, "up to start scout again", 30_000);

  const again = startedPid(up, "the agent scout");
  assert.match(up.output().stderr, new RegExp(`The agent scout \\(pid ${String(scout)}\\) ended by itself \\(signal SIGKILL\\)`));
  await untilRegistered("agent", "scout");
  const said = await shrimpy(["run", "scout", "hi"]);
  assert.equal(said.stdout, "Hello from the test model.\n", said.stderr);
  assert.equal(await pidOfAgent("scout"), again);
  assert.equal(up.programs().length, 5, "nothing else was started");
  assert.deepEqual([gateway, chat, rex].map(isAlive), [true, true, true]);
  assert.equal(await pidOfAgent("rex"), rex, "rex is the process it was");

  process.kill(chat, "SIGKILL");
  const finished = await within(30_000, up.finished, "up ending");
  assert.equal(finished.code, 1);
  assert.match(finished.stderr, /chat server/i);
  assert.deepEqual(up.programs().map(isAlive), [false, false, false, false, false]);
});

test("the pause before an agent that keeps ending is started again grows, and starts over once the agent has stayed up", { timeout }, async (t) => {
  const model = await testModel(t);
  await agentInFolder(t, model, "scout");
  const up = await startUpWithPace(t, [], { lookMs: 50, pauseMs: 100, longestPauseMs: 10_000, stableMs: 1_500 });
  const endings = (): number[] =>
    [...up.output().stderr.matchAll(/ended by itself \(signal SIGKILL\)\. It is started again after (\d+) milliseconds\./g)].map(
      (found) => Number(found[1]),
    );
  const killAndWaitForTheNext = async (stayUp: number): Promise<void> => {
    const pid = startedPid(up, "the agent scout");
    await delay(stayUp);
    process.kill(pid, "SIGKILL");
    await until(() => startedPid(up, "the agent scout") !== pid, "up to start scout again", 30_000);
  };

  // Killed the moment it is up, twice, and then after it has stayed up longer than it takes for the pauses to start over.
  await killAndWaitForTheNext(0);
  await killAndWaitForTheNext(0);
  await killAndWaitForTheNext(2_000);

  const [first, second, third] = endings();
  assert.ok(first !== undefined && second !== undefined && third !== undefined, up.output().stderr);
  assert.ok(second > first, `the pause grows while it keeps ending: ${String(first)}, then ${String(second)}`);
  assert.ok(third < second, `and starts over once the agent stayed up: ${String(third)}`);
});

test("a home that can't start for want of a model is said with the agent's words and does not stop the rest, and its agent starts at once when its agent.json names a model", { timeout }, async (t) => {
  const model = await testModel(t);
  const folder = useShrimpyDir(t);
  await agentInFolder(t, model, "scout");
  assert.equal((await shrimpy(["agent", "init", "rex"])).code, 0, "rex names no model, and the folder has no default");
  const rex = join(folder, "agents", "rex");
  declareLocalModel(rex, { url: model.url, model: "test-model" });
  // The pause is a minute, so only the change to agent.json can start rex in the time the test has.
  const up = await startUpWithPace(t, [], { ...quick, pauseMs: 60_000, longestPauseMs: 60_000 });
  const before = ["the gateway", "the chat server", "the agent scout"].map((what) => startedPid(up, what));
  await untilRegistered("agent", "scout");

  const said = up.output().stderr;
  assert.match(said, /\[agent rex\] The agent has no model to start with/, "it says what the agent said");
  assert.ok(said.includes(`Could not start the agent at ${rex}`), said);
  assert.equal(up.output().code, null, "and goes on");
  assert.deepEqual(before.map(isAlive), [true, true, true]);

  const named = { name: "rex", model: { provider: "local", id: "test-model" } };
  writeFileSync(join(rex, "agent.json"), `${JSON.stringify(named, null, 2)}\n`);
  await untilRegistered("agent", "rex");

  assert.equal(up.programs().length, 4);
  assert.deepEqual(before.map(isAlive), [true, true, true], "the rest was left as it was");
  assert.equal(await pidOfAgent("scout"), before[2]);
});

test("a home that can't start is said once however often it is tried, and starts when what it lacked comes, with no change to its agent.json", { timeout }, async (t) => {
  const model = await testModel(t);
  const folder = useShrimpyDir(t);
  assert.equal((await shrimpy(["agent", "init", "rex"])).code, 0);
  declareLocalModel(join(folder, "agents", "rex"), { url: model.url, model: "test-model" });
  const up = await startUpWithPace(t, [], { lookMs: 50, pauseMs: 50, longestPauseMs: 50, stableMs: 60_000 });
  await until(() => up.output().stderr.includes("Could not start the agent"), "up to say rex could not start", 30_000);

  await delay(2_000);

  const times = (text: string): number => up.output().stderr.split(text).length - 1;
  assert.equal(times("Could not start the agent"), 1);
  assert.equal(times("has no model to start with"), 1);
  assert.equal(up.output().code, null);

  // A default model for the folder is found by trying again.
  mkdirSync(join(folder, "providers"));
  writeFileSync(join(folder, "providers", "default-model.json"), JSON.stringify({ provider: "local", id: "test-model" }));
  await untilRegistered("agent", "rex");
  assert.match(up.output().stdout, /^Started the agent rex \(pid \d+\)/m);
});

test("an agent that someone else started is used as it is, and when it ends up starts the home's agent itself", { timeout }, async (t) => {
  const model = await testModel(t);
  const home = await agentInFolder(t, model, "scout");
  const byHand = await serve(t, home);
  const up = await startUpWithPace(t, [], quick);

  assert.equal(up.programs().length, 2, "only the gateway and the chat server were started");
  assert.match(up.output().stdout, /The agent at .*scout is already running \(pid \d+\); using it as it is\./);
  assert.equal(await pidOfAgent("scout"), byHand.listening.pid);

  await byHand.stop("SIGKILL");
  await until(() => up.programs().length === 3, "up to start scout itself", 30_000);

  const itself = startedPid(up, "the agent scout");
  assert.notEqual(itself, byHand.listening.pid);
  await untilRegistered("agent", "scout");
  assert.equal(await pidOfAgent("scout"), itself);
  assert.equal(up.output().code, null);
});
