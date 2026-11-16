import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import type { Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { joinHome } from "../agent/index.ts";
import { Agent, AGENT_HOME_VARIABLE, membershipFile, Session } from "../contracts/agent/index.ts";
import { initHome, readMembership } from "../contracts/agent/node.ts";
import { type Entry, formatAddress, type Member, writeLink } from "../contracts/gateway/index.ts";
import { connectGateway, type GatewayClient, type GatewayPlace, gatewaySocket } from "../contracts/gateway/node.ts";
import { type RunningGateway, startGateway } from "../gateway/index.ts";
import { eventually, stopAfter, tempDir, until, useRuntimeDir, within } from "../lib/testing/index.ts";
import {
  declareLocalModel,
  type ModelServer,
  type OnTheRoster,
  onTheRoster,
  serve,
  shrimpy,
  shrimpyInBackground,
  startModelServer,
  untilLinked,
} from "./testing/index.ts";
import { startTestChat } from "../contracts/chat/testing/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";

/*
 * An agent apart from the gateway, through real programs. The gateway runs in this process and listens on loopback, the
 * chat server and each agent in a process of their own, except where a test has to stop the gateway with a signal and
 * leave it open, and then the gateway is a process of its own too. What is apart has a runtime directory and a Shrimpy
 * folder of its own, so it shares no socket with the gateway and reaches it only over the network entry.
 */

const timeout = 120_000;
/** How long an agent gives a stop, if it has turns to wait for. One that has none ends much sooner, whatever the network is doing. */
const GRACE_MS = 5_000;
const context = BACKGROUND_CONTEXT;

interface Network {
  model: ModelServer;
  gateway: RunningGateway;
  /** Where the gateway keeps its roster, so that it can start again on it. */
  dataDir: string;
  /** You, on the gateway's own socket. */
  person: OnTheRoster;
}

/** The gateway, listening on loopback, with the chat server linked to it and a test model, in the test's runtime directory. */
async function startNetwork(t: TestContext): Promise<Network> {
  useRuntimeDir(t);
  const model = await startModelServer(t);
  const dataDir = tempDir(t, "gateway-data");
  const gateway = await startGateway({ dataDir, listen: [{ host: "127.0.0.1", port: 0 }] });
  stopAfter(t, () => gateway.close());
  await startTestChat(t);
  await untilLinked("chat", "chat");
  const person = await onTheRoster(t);
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
  const model = await startModelServer(t);
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  await startTestChat(t);
  await untilLinked("chat", "chat");
  const person = await onTheRoster(t);
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
 * pastes it where the agent lives. It keeps the gateway's address and the fingerprint of its key.
 */
async function homeFromApart(t: TestContext, network: Joining, name: string): Promise<{ home: string; member: Member }> {
  const { code, addresses, fingerprint } = await network.person.invite(name);
  const [address] = addresses;
  assert.ok(address);
  const home = homeFor(t, network, name);
  const { member } = await joinHome(home, writeLink({ name, address, code, fingerprint }));
  assert.deepEqual(readMembership(home)?.gateway, { ...address, fingerprint });
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

/** A client linked to the gateway at `place` as whoever `token` is, holding crab as a client does. Closed when the test ends. */
async function crabAs(t: TestContext, place: GatewayPlace, token: string | null) {
  const client: GatewayClient = await connectGateway({ place, token });
  stopAfter(t, () => client.close());
  const agent = await client.host.get(Agent, { agent: "crab" }, context);
  stopAfter(t, () => agent.release());
  return {
    client,
    /** Why crab does not let this client watch it, or null. */
    refusal: () => agent.refusal.value?.words ?? null,
    sessions: () => agent.sessions.value.map((session) => session.threadId),
    /** Hold one of crab's sessions, as a client watches it. */
    session: async (thread: string): Promise<Reference<typeof Session>> => {
      const held = await client.host.get(Session, { agent: "crab", session: thread }, context);
      stopAfter(t, () => held.release());
      return held;
    },
  };
}

/** Wait until a held session shows the work streaming, then stop it and wait until it is idle. */
async function watchAndStop(session: Reference<typeof Session>): Promise<void> {
  await until(() => session.status.value?.busy === true && JSON.stringify(session.window.value.items).includes("word"), "the work to show");
  const stopped = await session.stop(context);
  assert.equal(stopped.kind, "done", JSON.stringify(stopped));
  await until(() => session.status.value?.busy === false, "the work to stop");
}

/** An agent that is a member of the roster and runs nowhere, joined over the gateway's entry with an invitation of its own, its token and the entry it keeps. */
async function memberApart(t: TestContext, { person }: Network, name: string): Promise<{ member: Member; token: string; entry: Entry }> {
  const { code, addresses, fingerprint } = await person.invite(name);
  const [address] = addresses;
  assert.ok(address);
  const home = join(tempDir(t, "member-apart"), name);
  initHome(home, { name });
  const { member } = await joinHome(home, writeLink({ name, address, code, fingerprint }));
  const { token, gateway: entry } = readMembership(home) ?? {};
  assert.ok(token !== undefined && entry !== undefined);
  return { member, token, entry };
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

test("an agent apart joins with an invitation, answers, and a copy of its home is turned away", { timeout }, async (t) => {
  const network = await startNetwork(t);
  const { person } = network;
  const { home, member } = await homeFromApart(t, network, "crab");

  // Crab starts in a process of its own, with no sockets in common with the gateway.
  const apart = apartEnv(t);
  const crab = await serve(t, home, [], { env: apart });
  assert.ok(crab.listening.socket.startsWith(apart.SHRIMPY_RUNTIME_DIR), "its sockets are in a directory of its own");
  await untilLinked("agent", "crab");

  // The person's side: a message is answered, and the roster says the agent is running.
  const said = await shrimpy(["run", "crab", "hi"]);
  assert.equal(said.code, 0, said.stderr);
  assert.equal(said.stdout.trim(), "Hello from the test model.");
  const crabOnTheRoster = async () => (await person.members()).find((each) => each.id === member.id);
  assert.equal((await crabOnTheRoster())?.reachable, true);

  // A copy of the home holds the same token, and is turned away while the agent runs.
  const copy = join(tempDir(t, "apart-copy"), "crab");
  cpSync(home, copy, {
    recursive: true,
    filter: (source) => !source.startsWith(join(home, "runtime")) && !source.includes("agent.sqlite"),
  });
  const copying = shrimpyInBackground(t, ["agent", "serve", copy], {
    env: { ...apart, SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-copy") },
    untilStopped: true,
  });
  // It is told which file of its own to delete, to be an agent of its own.
  await until(() => copying.output().stderr.includes(membershipFile(copy)), "the copy to be turned away", 30_000);
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
  assert.deepEqual((await person.programs()).map((program) => program.kind), ["chat"]);
});

test("a shrimpy command in the shell of an agent apart reaches its gateway as that agent", { timeout }, async (t) => {
  const network = await startNetwork(t);
  const { person } = network;
  // Rex runs beside the gateway, to talk to. Crab is apart, and only its home is there: a command in its shell needs nothing more.
  await serve(t, homeFor(t, network, "rex"), [], { env: { HOME: tempDir(t, "rex-user") } });
  await untilLinked("agent", "rex");
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
  const thread = /\b(th_\w+)/.exec(said.stderr)?.[1];
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
  const roster = await shrimpy(["members"], shell);
  assert.ok(roster.code === 0 && roster.stdout.includes("rex") && roster.stdout.includes("crab"), "and it reads the roster");
  assert.equal((await shrimpy(["threads", "rex", "--json"])).stdout.trim(), "[]", "while the person has said nothing to rex");

  // Promoted at the gateway, crab may make a room, and it is crab's.
  await person.setAdmin(member.id, true);
  assert.equal((await shrimpy(["rooms", "new", "ops"], shell)).code, 0);
  assert.match((await shrimpy(["rooms"], shell)).stdout, /#ops/);
  assert.doesNotMatch((await shrimpy(["rooms"])).stdout, /ops/, "the person is not in it");

  // With the gateway gone, the command says which gateway it can't reach.
  await network.gateway.close();
  const down = await shrimpy(["rooms"], shell);
  assert.equal(down.code, 1);
  assert.ok(down.stderr.includes(`${gatewayAddress.host}:${String(gatewayAddress.port)}`), down.stderr);
});

test("an agent apart is reached by its name through the gateway, by whoever it lets in", { timeout }, async (t) => {
  const network = await startNetwork(t);
  const { person, gateway } = network;
  const { home } = await homeFromApart(t, network, "crab");
  const crab = await serve(t, home, [], { env: apartEnv(t) });
  await untilLinked("agent", "crab");
  const [address] = gateway.listening;
  assert.ok(address);

  // You, at the gateway's machine, find crab's work, watch it as it happens, and stop it.
  const thread = await startSlowWork(network);
  const yours = await crabAs(t, { path: gatewaySocket() }, null);
  assert.deepEqual(yours.sessions(), [thread]);
  await watchAndStop(await yours.session(thread));

  // An agent that is no admin may not look at another's sessions, from beside the gateway or from apart: it comes in on
  // the gateway's own socket and over its entry with the same token.
  const rex = await memberApart(t, network, "rex");
  const beside = await crabAs(t, { path: gatewaySocket() }, rex.token);
  const apart = await crabAs(t, rex.entry, rex.token);
  for (const refused of [beside, apart]) {
    await until(() => refused.refusal() !== null, "crab to refuse rex");
    assert.ok(refused.refusal()?.includes("rex"), "the agent knows who is asking");
    assert.deepEqual(refused.sessions(), []);
  }

  // Promoted, it may, at once, both ways. From apart it watches new work and stops it.
  await person.setAdmin(rex.member.id, true);
  const second = await startSlowWork(network);
  for (const admitted of [beside, apart]) {
    await until(() => admitted.refusal() === null && admitted.sessions().includes(second), "crab to let rex watch it");
    assert.deepEqual(new Set(admitted.sessions()), new Set([thread, second]));
  }
  await watchAndStop(await apart.session(second));

  const stopped = await crab.stop();
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(stopped.stderr, "", "a stop says nothing of who was watching it");
});

test("an agent apart links again by itself when the gateway starts again, and says so", { timeout }, async (t) => {
  const network = await startNetwork(t);
  const { home } = await homeFromApart(t, network, "crab");
  const crab = await serve(t, home, [], { env: apartEnv(t) });
  await untilLinked("agent", "crab");
  const before = await crabAs(t, { path: gatewaySocket() }, null);
  assert.deepEqual(before.sessions(), []);
  const [address] = network.gateway.listening;
  assert.ok(address);
  /** What the agent has told whoever reads its output about the gateway at that address. */
  const saidOfGateway = (): string[] => crab.output().stderr.split("\n").filter((line) => line.includes(formatAddress(address)));
  assert.deepEqual(saidOfGateway(), [], "nothing while it has the gateway");

  // What was held through the gateway goes with it.
  await network.gateway.close();
  await within(10_000, before.client.closed, "the link through the gateway to end with it");
  await until(() => saidOfGateway().length === 1, "the agent to say that it lost the gateway");

  // It comes back on the roster it kept, where it listened, and the agent, which never stopped, is found again.
  const back = await startGateway({ dataDir: network.dataDir });
  stopAfter(t, () => back.close());
  assert.deepEqual(back.listening, network.gateway.listening);
  await untilLinked("agent", "crab");
  await until(() => saidOfGateway().length === 2, "the agent to say that it is back");
  const after = await crabAs(t, { path: gatewaySocket() }, null);
  assert.deepEqual(after.sessions(), []);
  const said = await shrimpy(["run", "crab", "hi"]);
  assert.equal(said.stdout.trim(), "Hello from the test model.", "and it answers in a thread as before");
  assert.equal(saidOfGateway().length, 2, "and that was all it said of it");
});

test("an agent apart told to stop while its gateway is frozen ends within its grace", { timeout }, async (t) => {
  const network = await startNetworkOfProcesses(t);
  const { gateway } = network;
  const { home: reachedHome } = await homeFromApart(t, network, "rex");
  const { home: neverHome } = await homeFromApart(t, network, "maya");
  const reached = await serve(t, reachedHome, [], { env: apartEnv(t) });
  await untilLinked("agent", "rex");
  // Rex has chat too, which goes through the gateway as well.
  const said = await shrimpy(["run", "rex", "hi"]);
  assert.equal(said.code, 0, said.stderr);

  // A process that is stopped takes connections and answers none of them, and the connections it holds stay open.
  gateway.freeze();
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

test("a command in an agent apart's shell, interrupted while its gateway is frozen, ends at once", { timeout }, async (t) => {
  const network = await startNetworkOfProcesses(t);
  const { gateway, model } = network;
  await serve(t, homeFor(t, network, "rex"), [], { env: { HOME: tempDir(t, "rex-user") } });
  await untilLinked("agent", "rex");
  const { home } = await homeFromApart(t, network, "crab");
  // The shell has a runtime directory of its own, so its commands come in over the gateway's entry.
  const shell = { env: { [AGENT_HOME_VARIABLE]: home, SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-shell") } };

  // The command waits for an answer that comes slowly, over a connection through the gateway.
  const asked = model.requests.length;
  const waiting = shrimpyInBackground(t, ["run", "rex", "go slow"], shell);
  await until(() => model.requests.length > asked, "rex to start answering");
  gateway.freeze();

  waiting.kill("SIGINT");
  const result = await within(5_000, waiting.finished, "the command to end");
  assert.equal(result.code, 130, result.stderr);
});
