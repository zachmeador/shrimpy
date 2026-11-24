import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { saveMembership } from "../contracts/agent/node.ts";
import { startTestChat } from "../contracts/chat/testing/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { eventually, tempDir, until, within } from "../lib/testing/index.ts";
import type { Pace } from "./commands/index.ts";
import {
  agentHome,
  declareLocalModel,
  freeAddresses,
  isAlive,
  launchUp,
  type ModelServer,
  type RunningUp,
  serve,
  shrimpy,
  shrimpyInBackground,
  startModelServer,
  untilAnswering,
  untilGatewayAnswers,
  untilLinked,
  type UpProgram,
  useShrimpyDir,
} from "./testing/index.ts";

/*
 * These tests start Shrimpy as people do: `shrimpy up` is its own process, and
 * so is every program it starts. What up runs is read from the process table,
 * and when it is ready from what its programs do: a gateway that answers, a
 * program linked to it, an agent that answers at its home. Nothing here starts
 * a real model turn except the tests that need an agent to be busy.
 */

const timeout = 90_000;

/** The agent `name` in the Shrimpy folder, set up to use the test model. */
async function agentInFolder(t: TestContext, model: ModelServer, name: string): Promise<string> {
  const init = await shrimpy(["agent", "init", name, "--model", "local/test-model"]);
  assert.equal(init.code, 0, init.stderr);
  const home = join(useShrimpyDir(t), "agents", name);
  declareLocalModel(home, { url: model.url, model: "test-model" });
  return home;
}

/** The process ID of each program asked for, in the order asked: "gateway", "chat", or an agent's home. */
function pidsOf(programs: UpProgram[], ...which: string[]): number[] {
  return which.map((what) => {
    const found = programs.find((program) => (program.kind === "agent" ? program.home === what : program.kind === what));
    assert.ok(found, `up runs no ${what}: ${JSON.stringify(programs)}`);
    return found.pid;
  });
}

const alive = (programs: UpProgram[]): boolean[] => programs.map((program) => isAlive(program.pid));

test("up starts the gateway, the chat server and an agent per home, and stops them", { timeout }, async (t) => {
  const home = await agentHome(t, await startModelServer(t));
  const data = tempDir(t, "up-data");

  const up = launchUp(t, [home, "--data", data]);
  await up.until(untilLinked("chat", "chat"));
  await up.until(untilLinked("agent", "scout"));

  const programs = await up.programs();
  assert.equal(programs.length, 3);
  const [agent] = pidsOf(programs, home);
  await until(() => up.output().stdout.includes('shrimpy run scout "<text>"'), "up to say how to talk to the agent");
  const agentStatus = JSON.parse((await shrimpy(["agent", "status", "--agent", home])).stdout) as { running: boolean; pid: number };
  assert.deepEqual([agentStatus.running, agentStatus.pid], [true, agent]);
  assert.ok(existsSync(join(data, "chat", "state", "chat.sqlite")), "the chat server keeps its store in a folder of its own");
  assert.ok(existsSync(join(data, "gateway", "state", "roster.json")), "and the gateway its roster");

  up.kill("SIGTERM");
  const stopped = await up.finished;

  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(stopped.stderr, "");
  assert.deepEqual(alive(programs), [false, false, false]);
  assert.equal((await shrimpy(["status"])).code, 1);
});

test("up stops agents first and waits for a running turn, and a second request stops the turn instead", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const home = await agentHome(t, model);
  const data = tempDir(t, "up-data");
  /** Up, with scout at work on a message sent with `run`, which waits for the reply and prints it. */
  const atWork = async (): Promise<{ up: RunningUp; run: ReturnType<typeof shrimpyInBackground> }> => {
    const up = launchUp(t, [home, "--data", data]);
    await up.until(untilLinked("agent", "scout"));
    const asked = model.requests.length;
    const run = shrimpyInBackground(t, ["run", "scout", "answer in a moment"]);
    await until(() => model.requests.length > asked, "the model to start answering");
    return { up, run };
  };

  // One request: scout finishes its turn and the reply reaches chat, which up stops after the agent.
  const once = await atWork();
  once.up.kill("SIGTERM");
  const answered = await once.run.finished;
  assert.equal(answered.code, 0, answered.stderr);
  assert.match(answered.stdout, /word1 /);
  assert.equal((await once.up.finished).code, 0);

  // Two: scout stops without waiting, so no reply comes before chat goes. The second is sent once up has reacted to
  // the first, whatever it said, so that up passes it on to scout as a second signal and not with the first.
  const twice = await atWork();
  const said = twice.up.output().stdout.length;
  twice.up.kill("SIGTERM");
  await until(() => twice.up.output().stdout.length > said, "up to begin stopping");
  twice.up.kill("SIGINT");
  assert.equal((await twice.up.finished).code, 0);
  const cut = await twice.run.finished;
  assert.notEqual(cut.code, 0, "there was no reply to print");
  assert.doesNotMatch(cut.stdout, /word1 /);
});

test("a gateway and a chat server that are already running are used as they are, and left running", { timeout }, async (t) => {
  const home = await agentHome(t, await startModelServer(t));
  const gateway = await startTestGateway(t);
  const chat = await startTestChat(t);
  await untilLinked("chat", "chat");

  const up = launchUp(t, [home, "--data", tempDir(t, "up-data")]);
  await up.until(untilLinked("agent", "scout"));

  const started = await up.programs();
  assert.deepEqual(started.map((program) => program.kind), ["agent"], "only the agent was started");
  up.kill("SIGINT");
  const stopped = await up.finished;
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.deepEqual([gateway.listening.pid, chat.listening.pid].map(isAlive), [true, true], "up leaves what it did not start");
  assert.deepEqual(alive(started), [false]);
});

test("when everything is already running it starts nothing and exits at once", { timeout }, async (t) => {
  const home = await agentHome(t, await startModelServer(t));
  const gateway = await startTestGateway(t);
  const chat = await startTestChat(t);
  await untilLinked("chat", "chat");
  const agent = await serve(t, home);

  const up = launchUp(t, [home, "--data", tempDir(t, "up-data")]);

  const finished = await within(10_000, up.finished, "up ending");
  assert.equal(finished.code, 0, finished.stderr);
  assert.deepEqual([gateway.listening.pid, chat.listening.pid, agent.listening.pid].map(isAlive), [true, true, true]);
});

test("a program that ends by itself takes the rest down, and up says which and how, and exits 1", { timeout }, async (t) => {
  const home = await agentHome(t, await startModelServer(t));
  const up = launchUp(t, [home, "--data", tempDir(t, "up-data")]);
  await up.until(untilLinked("agent", "scout"));
  const programs = await up.programs();
  const [agent] = pidsOf(programs, home);
  assert.ok(agent !== undefined);

  process.kill(agent, "SIGKILL");
  const finished = await within(30_000, up.finished, "up ending");

  assert.equal(finished.code, 1);
  const named = finished.stderr.split("\n").some((line) => line.includes("scout") && line.includes("SIGKILL"));
  assert.ok(named, `it names the agent that ended, and how:\n${finished.stderr}`);
  assert.deepEqual(alive(programs), [false, false, false]);
});

test("a program that cannot start ends up with its own words, then stops what was started", { timeout }, async (t) => {
  const notAHome = tempDir(t, "not-a-home");
  const data = tempDir(t, "up-data");

  const finished = await launchUp(t, [notAHome, "--data", data]).finished;

  assert.equal(finished.code, 1);
  assert.ok(finished.stderr.includes(notAHome), "it passes on what the agent said of the folder");
  const kept = existsSync(join(data, "gateway", "state", "roster.json")) && existsSync(join(data, "chat", "state", "chat.sqlite"));
  assert.ok(kept, "the gateway and the chat server were started first");
  assert.equal((await shrimpy(["status"])).code, 1, "and no gateway is left");
  // Nor a chat server: another starts on its data, which one that runs would hold.
  await startTestChat(t, { dataDir: join(data, "chat") });
});

test("up with no arguments starts every agent in the Shrimpy folder, and keeps its data there", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const folder = useShrimpyDir(t);
  await agentInFolder(t, model, "scout");
  await agentInFolder(t, model, "rex");
  // A folder of agents/ with no agent.json in it is not an agent.
  mkdirSync(join(folder, "agents", "notes"));

  const up = launchUp(t, []);
  await up.until(untilLinked("agent", "scout"));
  await up.until(untilLinked("agent", "rex"));

  const programs = await up.programs();
  assert.equal(programs.length, 4, "the gateway, the chat server and the two agents");
  const status = JSON.parse((await shrimpy(["agent", "status", "--agent", "scout"])).stdout) as { running: boolean };
  assert.equal(status.running, true, "an agent is reached by its name");
  assert.equal((await shrimpy(["sessions", "list", "--agent", "rex"])).code, 0, "and so are its sessions");
  assert.ok(existsSync(join(folder, "gateway", "state", "roster.json")), "the gateway keeps its roster in the folder");
  assert.ok(existsSync(join(folder, "chat", "state", "chat.sqlite")), "and the chat server its store");

  up.kill("SIGTERM");
  const stopped = await up.finished;

  assert.equal(stopped.code, 0, stopped.stderr);
  assert.deepEqual(alive(programs), [false, false, false, false]);
});

test("run right after up gets its reply, even sent before the agent has joined chat", { timeout }, async (t) => {
  const home = await agentHome(t, await startModelServer(t));
  const up = launchUp(t, [home, "--data", tempDir(t, "up-data")]);
  // The agent is registered before it has connected to chat, so this message can arrive first.
  await up.until(untilLinked("agent", "scout"));

  const result = await shrimpy(["run", "scout", "hi"]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "Hello from the test model.\n");
});

test("a stop request while up is still starting stops what has started, and exits 0", { timeout }, async (t) => {
  const home = await agentHome(t, await startModelServer(t));
  const up = launchUp(t, [home, "--data", tempDir(t, "up-data")]);
  // The gateway is started first, and the agent last.
  await up.until(untilGatewayAnswers());
  const started = await up.programs();

  up.kill("SIGTERM");
  const finished = await within(30_000, up.finished, "up ending");

  assert.equal(finished.code, 0, finished.stderr);
  assert.ok(started.some((program) => program.kind === "gateway"));
  assert.deepEqual(alive(started).filter(Boolean), []);
  assert.equal((await shrimpy(["status"])).code, 1);
});

test("up starts no gateway or chat server for agents that all belong to a gateway elsewhere", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const [elsewhere] = await freeAddresses(["127.0.0.1"]);
  assert.ok(elsewhere);
  const scout = await agentHome(t, model, "scout");
  const rex = await agentHome(t, model, "rex");
  // Rex joined a gateway that is somewhere else, and nothing answers there now, so it keeps trying.
  saveMembership(rex, { token: newToken(), gateway: { ...elsewhere, fingerprint: "ocKmkNBacmPG6VxrlnuW3Q" } });
  // Each start has a data directory of its own, so that what one gateway kept is not another's to listen on.
  const data = (): string => tempDir(t, "up-data");
  const kinds = async (up: RunningUp): Promise<string[]> => (await up.programs()).map((program) => program.kind).sort();

  const alone = launchUp(t, [rex, "--data", data()]);
  await alone.until(untilAnswering(rex));
  assert.deepEqual(await kinds(alone), ["agent"], "rex alone");
  assert.equal((await shrimpy(["status"])).code, 1, "and no gateway is running here");
  alone.kill("SIGTERM");
  assert.equal((await alone.finished).code, 0);

  const told = launchUp(t, [rex, "--data", data(), "--listen", "127.0.0.1:0"]);
  await told.until(untilLinked("chat", "chat"));
  await told.until(untilAnswering(rex));
  assert.deepEqual(await kinds(told), ["agent", "chat", "gateway"], "the gateway and the chat server too, since it was told to listen");
  told.kill("SIGTERM");
  assert.equal((await told.finished).code, 0);

  const mixed = launchUp(t, [rex, scout, "--data", data()]);
  await mixed.until(untilLinked("agent", "scout"));
  await mixed.until(untilAnswering(rex));
  assert.deepEqual(await kinds(mixed), ["agent", "agent", "chat", "gateway"], "the gateway, the chat server and both agents");
  mixed.kill("SIGTERM");
  assert.equal((await mixed.finished).code, 0);
});

/*
 * Following the folder: `up` with no agents named keeps the homes of the Shrimpy folder running. These run it with
 * pauses of the test's own, and everything it starts is a process of its own.
 */

/** Looking and starting again as fast as a test can wait for. */
const quick: Pace = { lookMs: 100, pauseMs: 100, longestPauseMs: 400, stableMs: 1_000 };

/** The process ID of the agent at `home`, as `shrimpy agent status` says. */
async function pidOfAgent(home: string): Promise<number> {
  return (JSON.parse((await shrimpy(["agent", "status", "--agent", home])).stdout) as { pid: number }).pid;
}

/** Wait until up runs a process at `home` other than `not`, and say which. */
async function untilStartedAt(up: RunningUp, home: string, not?: number): Promise<number> {
  const found = await up.until(
    eventually(
      async () => (await up.programs()).find((program) => program.home === home && program.pid !== not)?.pid,
      (pid) => pid !== undefined,
      { what: `up to start the agent at ${home}`, timeoutMs: 30_000 },
    ),
  );
  assert.ok(found !== undefined);
  return found;
}

test("a home made while up runs is started, and a home taken away has its agent stopped", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const folder = useShrimpyDir(t);
  const scout = await agentInFolder(t, model, "scout");
  const up = launchUp(t, [], { pace: quick });
  await up.until(untilLinked("agent", "scout"));
  const before = pidsOf(await up.programs(), "gateway", "chat", scout);

  // The home is whole when it appears, as one is that is finished elsewhere and moved in.
  const rexHome = join(folder, "agents", "rex");
  renameSync(await agentHome(t, model, "rex"), rexHome);
  await up.until(untilLinked("agent", "rex"));

  const programs = await up.programs();
  assert.equal(programs.length, 4, "only the agent of the new home was started");
  assert.deepEqual(before.map(isAlive), [true, true, true]);
  assert.deepEqual(pidsOf(programs, scout), [before[2]], "scout is the process it was");
  const said = await shrimpy(["run", "rex", "hi"]);
  assert.equal(said.stdout, "Hello from the test model.\n", said.stderr);

  const [rex] = pidsOf(programs, rexHome);
  assert.ok(rex !== undefined);
  renameSync(rexHome, join(tempDir(t, "taken-away"), "rex"));
  await until(() => !isAlive(rex), "the agent of the home that was taken away to stop", 30_000);
  assert.deepEqual(before.map(isAlive), [true, true, true], "while the rest runs on");
  assert.equal(up.output().code, null);

  up.kill("SIGTERM");
  const stopped = await up.finished;
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.deepEqual(alive(programs), [false, false, false, false]);
});

test("an agent that is killed is started again alone, and a chat server that ends takes everything down", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const scoutHome = await agentInFolder(t, model, "scout");
  const rexHome = await agentInFolder(t, model, "rex");
  const up = launchUp(t, [], { pace: quick });
  await up.until(untilLinked("agent", "scout"));
  await up.until(untilLinked("agent", "rex"));
  const [gateway, chat, scout, rex] = pidsOf(await up.programs(), "gateway", "chat", scoutHome, rexHome);
  assert.ok(gateway && chat && scout && rex);

  process.kill(scout, "SIGKILL");
  const again = await untilStartedAt(up, scoutHome, scout);

  assert.ok(up.output().stderr.includes(String(scout)) && up.output().stderr.includes("SIGKILL"), "it says which ended, and how");
  await up.until(untilLinked("agent", "scout"));
  const said = await shrimpy(["run", "scout", "hi"]);
  assert.equal(said.stdout, "Hello from the test model.\n", said.stderr);
  assert.equal(await pidOfAgent(scoutHome), again);
  const programs = await up.programs();
  assert.deepEqual(programs.map((program) => program.pid).sort(), [gateway, chat, again, rex].sort(), "nothing else was started");
  assert.equal(await pidOfAgent(rexHome), rex, "rex is the process it was");

  process.kill(chat, "SIGKILL");
  const finished = await within(30_000, up.finished, "up ending");
  assert.equal(finished.code, 1);
  assert.deepEqual(alive(programs), [false, false, false, false]);
});

test("the pause before an agent that keeps ending is started again grows, then starts over", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const home = await agentInFolder(t, model, "scout");
  const pace: Pace = { lookMs: 50, pauseMs: 2_000, longestPauseMs: 60_000, stableMs: 3_000 };
  const up = launchUp(t, [], { pace });
  /** Kill the agent once it has answered for `stayUp`, and say how long up took to start the next one. */
  const restartedAfter = async (stayUp: number): Promise<number> => {
    await up.until(untilAnswering(home));
    const pid = pidsOf(await up.programs(), home)[0];
    assert.ok(pid !== undefined);
    // How long it stays up is what the pause starts over by.
    await delay(stayUp);
    process.kill(pid, "SIGKILL");
    const killed = Date.now();
    await untilStartedAt(up, home, pid);
    return Date.now() - killed;
  };

  // Killed the moment it answers, twice, and then after it has stayed up longer than it takes for the pauses to start over.
  const first = await restartedAfter(0);
  const second = await restartedAfter(0);
  const third = await restartedAfter(pace.stableMs + 500);

  assert.ok(second > first, `the pause grows while it keeps ending: ${String(first)} ms, then ${String(second)} ms`);
  assert.ok(third < second, `and starts over once the agent stayed up: ${String(third)} ms`);
});

test("a home that can't start for want of a model stops nothing else, and starts once it names one", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const folder = useShrimpyDir(t);
  const scout = await agentInFolder(t, model, "scout");
  assert.equal((await shrimpy(["agent", "init", "rex"])).code, 0, "rex names no model, and the folder has no default");
  const rex = join(folder, "agents", "rex");
  declareLocalModel(rex, { url: model.url, model: "test-model" });
  // The pause is a minute, so only the change to agent.json can start rex in the time the test has.
  const up = launchUp(t, [], { pace: { ...quick, pauseMs: 60_000, longestPauseMs: 60_000 } });
  await up.until(untilLinked("agent", "scout"));
  const before = pidsOf(await up.programs(), "gateway", "chat", scout);

  const config = join(rex, "agent.json");
  await up.until(until(() => up.output().stderr.includes(config), "up to pass on what rex said, which names the file to change", 30_000));
  assert.equal(up.output().code, null, "and goes on");
  assert.deepEqual(before.map(isAlive), [true, true, true]);

  const named = { name: "rex", model: { provider: "local", id: "test-model" } };
  writeFileSync(config, `${JSON.stringify(named, null, 2)}\n`);
  await up.until(untilLinked("agent", "rex"));

  const programs = await up.programs();
  assert.equal(programs.length, 4);
  assert.deepEqual(before.map(isAlive), [true, true, true], "the rest was left as it was");
  assert.deepEqual(pidsOf(programs, scout), [before[2]]);
});

test("a home that can't start is said once however often it is tried, and starts once it can", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const folder = useShrimpyDir(t);
  assert.equal((await shrimpy(["agent", "init", "rex"])).code, 0);
  const rex = join(folder, "agents", "rex");
  declareLocalModel(rex, { url: model.url, model: "test-model" });
  const up = launchUp(t, [], { pace: { lookMs: 50, pauseMs: 50, longestPauseMs: 50, stableMs: 60_000 } });
  // What the agent says names its agent.json, on one line.
  const config = join(rex, "agent.json");
  const said = (): number => up.output().stderr.split("\n").filter((line) => line.includes(config)).length;

  // Each try is a process of its own, at rex's home.
  const tries = new Set<number>();
  await up.until(
    eventually(
      async () => {
        for (const program of await up.programs()) if (program.home === rex) tries.add(program.pid);
        return tries.size;
      },
      (count) => count >= 4,
      { what: "up to try rex four times", timeoutMs: 30_000 },
    ),
  );

  assert.equal(said(), 1);
  assert.equal(up.output().code, null);

  // A default model for the folder is found by trying again.
  mkdirSync(join(folder, "providers"));
  writeFileSync(join(folder, "providers", "default-model.json"), JSON.stringify({ provider: "local", id: "test-model" }));
  await up.until(untilLinked("agent", "rex"));
});

test("an agent someone else started is used as it is, and up starts its own once that ends", { timeout }, async (t) => {
  const model = await startModelServer(t);
  const home = await agentInFolder(t, model, "scout");
  const byHand = await serve(t, home);
  const up = launchUp(t, [], { pace: quick });
  await up.until(untilLinked("chat", "chat"));

  assert.deepEqual((await up.programs()).map((program) => program.kind).sort(), ["chat", "gateway"], "only the gateway and the chat server were started");
  assert.equal(await pidOfAgent(home), byHand.listening.pid);

  await byHand.stop("SIGKILL");
  const itself = await untilStartedAt(up, home);

  assert.notEqual(itself, byHand.listening.pid);
  await up.until(untilLinked("agent", "scout"));
  assert.equal(await pidOfAgent(home), itself);
  assert.equal(up.output().code, null);
});
