import assert from "node:assert/strict";
import { cpSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { initHome, joinHome } from "../agent/index.ts";
import { AGENT_HOME_VARIABLE } from "../contracts/agent/index.ts";
import { readMembership } from "../contracts/agent/node.ts";
import { type GatewayConnection, type Member, writeLink } from "../contracts/gateway/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { type RunningGateway, startGateway } from "../gateway/index.ts";
import { eventually, stopAfter, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import {
  declareLocalModel,
  type ModelServer,
  serve,
  serveChat,
  shrimpy,
  shrimpyInBackground,
  startModelServer,
  untilRegistered,
} from "./testing/index.ts";

/*
 * An agent apart from the gateway, through real programs. The gateway runs in this process and listens on loopback, the
 * chat server and each agent in a process of their own. What is apart has a runtime directory and a Shrimpy folder of
 * its own, so it shares no socket with the gateway and reaches it only over the network entry.
 */

const timeout = 120_000;

interface Network {
  model: ModelServer;
  gateway: RunningGateway;
  /** A connection on the gateway's own socket, which is the person who runs it. */
  person: GatewayConnection;
}

/** The gateway, listening on loopback, with the chat server registered with it and a test model, in the test's runtime directory. */
async function startNetwork(t: TestContext): Promise<Network> {
  useRuntimeDir(t);
  const model = await startModelServer();
  stopAfter(t, () => model.close());
  const gateway = await startGateway({ dataDir: tempDir(t, "gateway-data"), listen: [{ host: "127.0.0.1", port: 0 }] });
  stopAfter(t, () => gateway.close());
  await serveChat(t, tempDir(t, "chat-data"));
  await untilRegistered("chat", "chat");
  const person = await connectLocalGateway();
  stopAfter(t, () => person.close());
  return { model, gateway, person };
}

/** A home for the agent called `name` that talks to the test model. */
function homeFor(t: TestContext, { model }: Network, name: string): string {
  const home = join(tempDir(t, "home"), name);
  initHome(home, { name, model: { provider: "local", id: "test-model" } });
  declareLocalModel(home, { url: model.url, model: "test-model" });
  return home;
}

/**
 * A home for the agent called `name`, joined with the link of an invitation that the person asked for, as a person
 * pastes it where the agent lives. It keeps the gateway's address.
 */
async function homeFromApart(t: TestContext, network: Network, name: string): Promise<{ home: string; member: Member }> {
  const { code, addresses } = await network.person.invite(name);
  const [address] = addresses;
  assert.ok(address);
  const home = homeFor(t, network, name);
  const member = await joinHome(home, writeLink({ name, address, code }));
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
  await assert.rejects(person.ticket({ kind: "agent", name: "crab" }), /can't be reached yet/);

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

  // When crab stops, it is no longer listed as running, and it is still on the roster.
  const stopped = await crab.stop();
  assert.equal(stopped.code, 0, stopped.stderr);
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
