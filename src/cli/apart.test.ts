import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { initHome, joinHome } from "../agent/index.ts";
import { AGENT_HOME_VARIABLE, connectAgent } from "../contracts/agent/index.ts";
import { readMembership } from "../contracts/agent/node.ts";
import {
  connectGateway,
  formatAddress,
  type GatewayConnection,
  type Member,
  NEEDS_ADMIN,
  reachProgram,
  type Transports,
  writeLink,
} from "../contracts/gateway/index.ts";
import { connectLocalGateway, entryTransports, localTransports, newToken } from "../contracts/gateway/node.ts";
import { type RunningGateway, startGateway } from "../gateway/index.ts";
import { isRefusal, reasonOf } from "../lib/refusal/index.ts";
import { eventually, stopAfter, tempDir, until, useRuntimeDir, waitForView, within } from "../lib/testing/index.ts";
import {
  declareLocalModel,
  type ModelServer,
  serve,
  serveChat,
  serveGateway,
  shrimpy,
  shrimpyInBackground,
  startModelServer,
  untilRegistered,
} from "./testing/index.ts";

/*
 * An agent apart from the gateway, through real programs. The gateway runs in this process and listens on loopback, the
 * chat server and each agent in a process of their own, except where a test has to stop the gateway with a signal and
 * leave it open, and then the gateway is a process of its own too. What is apart has a runtime directory and a Shrimpy
 * folder of its own, so it shares no socket with the gateway and reaches it only over the network entry.
 */

const timeout = 120_000;
/** How long an agent gives a stop, if it has turns to wait for. One that has none ends much sooner, whatever the network is doing. */
const GRACE_MS = 5_000;
const CRAB = { kind: "agent", name: "crab" } as const;

interface Network {
  model: ModelServer;
  gateway: RunningGateway;
  /** Where the gateway keeps its roster, so that it can start again on it. */
  dataDir: string;
  /** A connection on the gateway's own socket, which is the person who runs it. */
  person: GatewayConnection;
}

/**
 * The gateway, listening on loopback, with the chat server registered with it and a test model, in the test's runtime
 * directory. `silenceMs` is how long the gateway lets a connection stay silent before it lets go of it.
 */
async function startNetwork(t: TestContext, options: { silenceMs?: number } = {}): Promise<Network> {
  useRuntimeDir(t);
  const model = await startModelServer();
  stopAfter(t, () => model.close());
  const dataDir = tempDir(t, "gateway-data");
  const gateway = await startGateway({ dataDir, listen: [{ host: "127.0.0.1", port: 0 }], ...options });
  stopAfter(t, () => gateway.close());
  await serveChat(t, tempDir(t, "chat-data"));
  await untilRegistered("chat", "chat");
  const person = await connectLocalGateway();
  stopAfter(t, () => person.close());
  return { model, gateway, dataDir, person };
}

/**
 * What an agent apart needs of a network to join it: the test model its home talks to, and a connection on the
 * gateway's own socket, which is the person who runs the gateway.
 */
type Joining = Pick<Network, "model" | "person">;

/**
 * The gateway as the process people start, with the chat server and a test model, in the test's runtime directory.
 * Unlike the one in `startNetwork`, it can be stopped with a signal and left open, as a gateway that went dead is.
 */
async function startNetworkOfProcesses(t: TestContext) {
  useRuntimeDir(t);
  const model = await startModelServer();
  stopAfter(t, () => model.close());
  const gateway = await serveGateway(t, ["--listen", "127.0.0.1:0"]);
  await serveChat(t, tempDir(t, "chat-data"));
  await untilRegistered("chat", "chat");
  const person = await connectLocalGateway();
  stopAfter(t, () => person.close());
  return { model, gateway, person };
}

/** A home for the agent called `name` that talks to the test model. */
function homeFor(t: TestContext, { model }: Pick<Network, "model">, name: string): string {
  const home = join(tempDir(t, "home"), name);
  initHome(home, { name, model: { provider: "local", id: "test-model" } });
  declareLocalModel(home, { url: model.url, model: "test-model" });
  return home;
}

/**
 * A home for the agent called `name`, joined with the link of an invitation that the person asked for, as a person
 * pastes it where the agent lives. It keeps the gateway's address.
 */
async function homeFromApart(t: TestContext, network: Joining, name: string): Promise<{ home: string; member: Member }> {
  const { code, addresses } = await network.person.invite(name);
  const [address] = addresses;
  assert.ok(address);
  const home = homeFor(t, network, name);
  const { member } = await joinHome(home, writeLink({ name, address, code }));
  assert.deepEqual(readMembership(home)?.gateway, address);
  assert.equal(readMembership(home)?.memberId, member.id);
  return { home, member };
}

/** What a process that is apart is started with: a runtime directory of its own, and a Shrimpy folder and a user's directory. */
function apartEnv(t: TestContext): { SHRIMPY_RUNTIME_DIR: string; SHRIMPY_DIR: string; HOME: string } {
  return {
    SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-apart"),
    SHRIMPY_DIR: join(tempDir(t, "apart-folder"), "shrimpy"),
    HOME: tempDir(t, "apart-user"),
  };
}

/** Reach the agent crab by its name the way a client does, as whoever `asking` is, over `transports`. Hung up when the test ends. */
async function reachCrab(t: TestContext, asking: GatewayConnection, transports: Transports) {
  const { connection, entered } = await reachProgram({
    gateway: asking,
    transports,
    target: CRAB,
    connect: connectAgent,
    enter: (opened, ticket) => opened.enter(ticket),
  });
  stopAfter(t, () => connection.close());
  return { connection, entered };
}

/**
 * An agent that is a member of the roster and runs nowhere, joined over the gateway's entry with an invitation of its
 * own: its connection is signed in as it, and its token signs it in anywhere else.
 */
async function memberApart(t: TestContext, { person }: Network, name: string) {
  const { code, addresses } = await person.invite(name);
  const [address] = addresses;
  assert.ok(address);
  const connection = await connectGateway({ transportFactory: entryTransports(address).gateway });
  stopAfter(t, () => connection.close());
  const token = newToken();
  const member = await connection.join(name, token, code);
  return { connection, member, token };
}

/** Message crab with something it answers slowly, so that its session is at work until someone stops it. Says which thread it is in. */
async function startSlowWork(network: Network): Promise<string> {
  const asked = network.model.requests.length;
  const started = await shrimpy(["run", "crab", "go slow", "--no-wait"]);
  assert.equal(started.code, 0, started.stderr);
  const thread = /\b(th_\w+)/.exec(`${started.stdout}\n${started.stderr}`)?.[1];
  assert.ok(thread, `${started.stdout}\n${started.stderr}`);
  await until(() => network.model.requests.length > asked, "the model to start answering");
  return thread;
}

test("an agent apart joins with an invitation link, answers a person, is listed as running, a copy of its home is turned away, and it is no longer listed when it stops", { timeout }, async (t) => {
  const network = await startNetwork(t);
  const { person } = network;
  const { home, member } = await homeFromApart(t, network, "crab");

  // Crab starts in a process of its own, with no sockets in common with the gateway.
  const apart = apartEnv(t);
  const crab = await serve(t, home, [], { env: apart });
  assert.ok(crab.listening.socket.startsWith(apart.SHRIMPY_RUNTIME_DIR), "its sockets are in a directory of its own");
  await untilRegistered("agent", "crab");

  // The person's side: a message is answered, and the roster says the agent is running.
  const said = await shrimpy(["run", "crab", "hi"]);
  assert.equal(said.code, 0, said.stderr);
  assert.equal(said.stdout.trim(), "Hello from the test model.");
  const crabOnTheRoster = async () => (await person.members()).find((each) => each.id === member.id);
  assert.equal((await crabOnTheRoster())?.reachable, true);
  assert.equal((await person.ticket(CRAB)).serverId, crab.listening.serverId, "a ticket is made for it, as for any program");

  // A copy of the home holds the same token, and is turned away while the agent runs.
  const copy = join(tempDir(t, "apart-copy"), "crab");
  cpSync(home, copy, {
    recursive: true,
    filter: (source) => !source.startsWith(join(home, "runtime")) && !source.includes("agent.sqlite"),
  });
  const copying = shrimpyInBackground(["agent", "serve", copy], {
    env: { ...apart, SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-copy") },
    untilStopped: true,
  });
  stopAfter(t, async () => {
    copying.kill("SIGKILL");
    await copying.finished;
  });
  await until(() => copying.output().stderr.includes("already running"), "the copy to be turned away", 30_000);
  assert.equal((await person.members()).filter((each) => each.name === "crab").length, 1, "and it made no member of its own");
  const again = await shrimpy(["run", "crab", "hi again"]);
  assert.equal(again.stdout.trim(), "Hello from the test model.", "the agent that was running is still the one that answers");
  copying.kill("SIGTERM");
  assert.equal((await copying.finished).code, 0);

  // When crab stops, it is no longer listed as running, and it is still on the roster. A stop is no failure, so it says nothing.
  const stopped = await crab.stop();
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(stopped.stderr, "", "a plain stop says nothing of the gateway, chat or calls");
  const gone = await eventually(crabOnTheRoster, (entry) => entry?.reachable === false, { what: "crab to stop being listed as running" });
  assert.equal(gone?.name, "crab");
  assert.deepEqual((await person.list()).map((program) => program.kind), ["chat"]);
});

test("a shrimpy command in the shell of an agent apart reaches the gateway its home names, as that agent", { timeout }, async (t) => {
  const network = await startNetwork(t);
  const { person } = network;
  // Rex runs beside the gateway, to talk to. Crab is apart, and only its home is there: a command in its shell needs nothing more.
  await serve(t, homeFor(t, network, "rex"), [], { env: { HOME: tempDir(t, "rex-user") } });
  await untilRegistered("agent", "rex");
  const { home, member } = await homeFromApart(t, network, "crab");
  const gatewayAddress = readMembership(home)?.gateway;
  assert.ok(gatewayAddress);
  // The shell has a runtime directory of its own, so the gateway's socket is nowhere in reach.
  const shell = { env: { [AGENT_HOME_VARIABLE]: home, SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-shell") } };

  // It talks as crab: an agent that is no admin can't make a room, and says who may.
  const refused = await shrimpy(["rooms", "new", "ops"], shell);
  assert.equal(refused.code, 1);
  assert.ok(refused.stderr.includes("crab") && refused.stderr.includes(userInfo().username), refused.stderr);
  const said = await shrimpy(["run", "rex", "hi"], shell);
  assert.equal(said.code, 0, said.stderr);
  assert.equal(said.stdout.trim(), "Hello from the test model.");
  const thread = /Thread (\S+) started/.exec(said.stderr)?.[1];
  assert.ok(thread, said.stderr);
  const threads = JSON.parse((await shrimpy(["threads", "rex", "--json"], shell)).stdout) as { id: string }[];
  assert.ok(threads.some((each) => each.id === thread), "the thread is in crab's DM with rex");
  const read = JSON.parse((await shrimpy(["read", thread, "--json"], shell)).stdout) as {
    messages: { author: { name: string }; text: string }[];
  };
  assert.deepEqual(read.messages.map((each) => [each.author.name, each.text]), [
    ["crab", "hi"],
    ["rex", "Hello from the test model."],
  ]);
  assert.match((await shrimpy(["members"], shell)).stdout, /rex\s+agent[\s\S]*crab\s+agent/, "and it reads the roster");
  assert.equal((await shrimpy(["threads", "rex", "--json"])).stdout.trim(), "[]", "while the person has said nothing to rex");

  // Promoted at the gateway, crab may make a room, and it is crab's.
  await person.promote(member.id);
  assert.equal((await shrimpy(["rooms", "new", "ops"], shell)).code, 0);
  assert.match((await shrimpy(["rooms"], shell)).stdout, /#ops/);
  assert.doesNotMatch((await shrimpy(["rooms"])).stdout, /ops/, "the person is not in it");

  // With the gateway gone, the command says which gateway it can't reach.
  await network.gateway.close();
  const down = await shrimpy(["rooms"], shell);
  assert.equal(down.code, 1);
  assert.ok(down.stderr.includes(`${gatewayAddress.host}:${String(gatewayAddress.port)}`), down.stderr);
});

test("an agent apart is reached by its name through the gateway, from the gateway's machine and from apart: its sessions are listed, one is watched while it works and stopped, and what a caller may do is the agent's own rule", { timeout }, async (t) => {
  const network = await startNetwork(t);
  const { person, gateway } = network;
  const { home } = await homeFromApart(t, network, "crab");
  const crab = await serve(t, home, [], { env: apartEnv(t) });
  await untilRegistered("agent", "crab");
  const [address] = gateway.listening;
  assert.ok(address);
  const entry = entryTransports(address);

  // The person who runs the gateway, at the gateway's machine, finds crab's work, watches it as it happens, and stops it.
  const thread = await startSlowWork(network);
  const reached = await reachCrab(t, person, localTransports());
  assert.equal(reached.entered.kind, "person");
  assert.deepEqual((await reached.connection.sessions()).map((session) => session.threadId), [thread]);
  const session = await reached.connection.attach(thread);
  await waitForView(session, (view) => view.status.busy && JSON.stringify(view.items).includes("word"));
  await session.stop();
  await waitForView(session, (view) => !view.status.busy);

  // An agent that is no admin may not look at another's sessions or change what it is told, from beside the gateway or
  // from apart. It joined over the entry, and comes in on the gateway's own socket with the same token.
  const rex = await memberApart(t, network, "rex");
  const beside = await connectLocalGateway();
  stopAfter(t, () => beside.close());
  await beside.signIn(rex.token, null);
  const needsAdmin = (error: unknown): boolean => isRefusal(error) && reasonOf(error) === NEEDS_ADMIN;
  for (const [asking, transports] of [[beside, localTransports()], [rex.connection, entry]] as const) {
    const refused = await reachCrab(t, asking, transports);
    assert.equal(refused.entered.name, "rex", "the agent knows who is asking");
    await assert.rejects(refused.connection.sessions(), needsAdmin);
    await assert.rejects(refused.connection.attach(thread), needsAdmin);
    await assert.rejects(refused.connection.reload(), needsAdmin);
  }

  // Promoted, it may, as soon as it comes in again, both ways at once. From apart it watches new work and stops it.
  await person.promote(rex.member.id);
  const second = await startSlowWork(network);
  const [admittedBeside, admittedApart] = await Promise.all([
    reachCrab(t, beside, localTransports()),
    reachCrab(t, rex.connection, entry),
  ]);
  for (const { connection } of [admittedBeside, admittedApart]) {
    assert.deepEqual(new Set((await connection.sessions()).map((each) => each.threadId)), new Set([thread, second]));
  }
  const watched = await admittedApart.connection.attach(second);
  await waitForView(watched, (view) => view.status.busy && JSON.stringify(view.items).includes("word"));
  await watched.stop();
  await waitForView(watched, (view) => !view.status.busy);

  // Stopping the agent ends the connections it answered.
  const ended = Promise.all(
    [reached, admittedBeside, admittedApart].map(({ connection }) => new Promise<void>((resolve) => connection.onDisconnect(() => resolve()))),
  );
  const stopped = await crab.stop();
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(stopped.stderr, "", "and a stop that ends them says nothing of them");
  await within(10_000, ended, "the connections through the gateway to end with the agent");
});

test("when the gateway stops and starts again, an agent apart registers again by itself and is reached again, and says that it lost the gateway and that it is back", { timeout }, async (t) => {
  const network = await startNetwork(t);
  const { home } = await homeFromApart(t, network, "crab");
  const crab = await serve(t, home, [], { env: apartEnv(t) });
  await untilRegistered("agent", "crab");
  const before = await reachCrab(t, network.person, localTransports());
  assert.deepEqual(await before.connection.sessions(), []);
  const ended = new Promise<void>((resolve) => before.connection.onDisconnect(() => resolve()));
  const [address] = network.gateway.listening;
  assert.ok(address);
  /** What the agent has told whoever reads its output about the gateway at that address. */
  const saidOfGateway = (): string[] => crab.output().stderr.split("\n").filter((line) => line.includes(formatAddress(address)));
  assert.deepEqual(saidOfGateway(), [], "nothing while it has the gateway");

  // What was joined through the gateway goes with it.
  await network.gateway.close();
  await within(10_000, ended, "the connection through the gateway to end with it");
  await until(() => saidOfGateway().length === 1, "the agent to say that it lost the gateway");

  // It comes back on the roster it kept, where it listened, and the agent, which never stopped, is found again.
  const back = await startGateway({ dataDir: network.dataDir });
  stopAfter(t, () => back.close());
  assert.deepEqual(back.listening, network.gateway.listening);
  await untilRegistered("agent", "crab");
  await until(() => saidOfGateway().length === 2, "the agent to say that it is back");
  const person = await connectLocalGateway();
  stopAfter(t, () => person.close());
  const after = await reachCrab(t, person, localTransports());
  assert.deepEqual(await after.connection.sessions(), []);
  const said = await shrimpy(["run", "crab", "hi"]);
  assert.equal(said.stdout.trim(), "Hello from the test model.", "and it answers in a thread as before");
  assert.equal(saidOfGateway().length, 2, "and that was all it said of it");
});

test("an agent apart whose connection stops answering without closing is no longer listed as running, what was joined through the gateway to it is let go of, and it is registered again once it answers", { timeout }, async (t) => {
  const silenceMs = 1000;
  const network = await startNetwork(t, { silenceMs });
  const { person } = network;
  const { home, member } = await homeFromApart(t, network, "crab");
  const crab = await serve(t, home, [], { env: apartEnv(t) });
  await untilRegistered("agent", "crab");
  const reached = await reachCrab(t, person, localTransports());
  const ended = new Promise<void>((resolve) => reached.connection.onDisconnect(() => resolve()));
  const listed = async () => (await person.members()).find((each) => each.id === member.id)?.reachable;
  assert.equal(await listed(), true);

  // A process that is stopped takes connections and answers none of them, and its end of each stays open.
  process.kill(crab.listening.pid, "SIGSTOP");
  await eventually(listed, (running) => running === false, { what: "crab to stop being listed as running", timeoutMs: 5 * silenceMs });
  await within(5 * silenceMs, ended, "the connection through the gateway to crab to end with it");

  process.kill(crab.listening.pid, "SIGCONT");
  await eventually(listed, (running) => running === true, { what: "crab to be listed as running again", timeoutMs: 15_000 });
  const again = await reachCrab(t, person, localTransports());
  assert.deepEqual(await again.connection.sessions(), [], "and it is reached again");
});

test("an agent apart that is told to stop while its gateway is frozen ends within its grace and says nothing, whether it had reached the gateway or not", { timeout }, async (t) => {
  const network = await startNetworkOfProcesses(t);
  const { gateway } = network;
  const { home: reachedHome } = await homeFromApart(t, network, "rex");
  const { home: neverHome } = await homeFromApart(t, network, "maya");
  const reached = await serve(t, reachedHome, [], { env: apartEnv(t) });
  await untilRegistered("agent", "rex");
  // Rex has chat too, which goes through the gateway as well.
  const said = await shrimpy(["run", "rex", "hi"]);
  assert.equal(said.code, 0, said.stderr);

  // A process that is stopped takes connections and answers none of them, and the connections it holds stay open.
  process.kill(gateway.listening.pid, "SIGSTOP");
  // Maya starts with a gateway that takes her connection and never answers.
  const never = await serve(t, neverHome, [], { env: apartEnv(t) });

  const stops = await Promise.all(
    [reached, never].map(async (agent) => {
      const started = Date.now();
      const result = await within(2 * GRACE_MS, agent.stop(), "the agent to stop");
      return { result, took: Date.now() - started };
    }),
  );
  for (const { result, took } of stops) {
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "", "a stop says nothing, however the network is");
    assert.ok(took < GRACE_MS, `it ended in ${String(took)} ms`);
  }
});

test("a shrimpy command in the shell of an agent apart that is interrupted while its gateway is frozen ends at once", { timeout }, async (t) => {
  const network = await startNetworkOfProcesses(t);
  const { gateway, model } = network;
  await serve(t, homeFor(t, network, "rex"), [], { env: { HOME: tempDir(t, "rex-user") } });
  await untilRegistered("agent", "rex");
  const { home } = await homeFromApart(t, network, "crab");
  // The shell has a runtime directory of its own, so its commands come in over the gateway's entry.
  const shell = { env: { [AGENT_HOME_VARIABLE]: home, SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-shell") } };

  // The command waits for an answer that comes slowly, over a connection through the gateway.
  const asked = model.requests.length;
  const waiting = shrimpyInBackground(["run", "rex", "go slow"], shell);
  await until(() => model.requests.length > asked, "rex to start answering");
  process.kill(gateway.listening.pid, "SIGSTOP");

  waiting.kill("SIGINT");
  const result = await within(5_000, waiting.finished, "the command to end");
  assert.equal(result.code, 130, result.stderr);
});
