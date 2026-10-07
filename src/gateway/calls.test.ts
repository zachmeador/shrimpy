import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { answerPath, entryTransports, type GatewayConnection, reachProgram, type Transports } from "../contracts/gateway/index.ts";
import { connectLocalGateway, localTransports } from "../contracts/gateway/node.ts";
import { isDisconnected } from "../lib/connection/index.ts";
import { eventually, stopAfter, useRuntimeDir, within } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import type { GatewayOptions } from "./index.ts";
import {
  connectApart,
  connectEcho,
  entryOf,
  handshakeStatus,
  invited,
  joinAndRegister,
  LOOPBACK,
  startAgentApart,
  startGatewayInProcess,
} from "./testing/index.ts";

/*
 * An agent apart from the gateway registers with no socket, so the gateway can't dial it. It makes a call for the
 * agent when a client asks for it, tells the agent over the connection it registered on, and the agent answers by
 * opening one more connection, which the gateway joins to the client's. Everything here is over real connections on
 * loopback. The agent's own server is an echo program in the test's runtime directory, which the gateway is never
 * told of.
 */

const timeout = 30_000;
const CRAB = { kind: "agent", name: "crab" } as const;
const REX = { kind: "agent", name: "rex" } as const;

/** A gateway that listens for agents apart from it, with the person who runs it on its socket. */
async function gatewayWithPerson(t: TestContext, options: Partial<GatewayOptions> = {}) {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t, { listen: LOOPBACK, ...options });
  stopAfter(t, () => gateway.close());
  const person = await connectLocalGateway();
  stopAfter(t, () => person.close());
  return { gateway, person };
}

/**
 * Ask for an agent by its name the way a client does, and connect to the echo
 * program that answers. It settles once the agent has answered, or the call
 * has failed, and fails with what `isDisconnected` says if the connection
 * ended. A failure is held until it is looked at, so it is never unhandled.
 */
function ask(
  asking: Pick<GatewayConnection, "ticket">,
  transports: Pick<Transports, "program">,
  target: typeof CRAB | typeof REX,
  serverId: string,
) {
  const reached = reachProgram({
    gateway: asking,
    transports,
    target,
    connect: ({ transportFactory }) => connectEcho(serverId, transportFactory),
    enter: () => Promise.resolve(undefined),
  });
  reached.catch(() => undefined);
  return reached;
}

test("a client that asks for an agent apart, from the gateway's machine or from apart, is joined to it once it answers, and only the agent is told of its calls", { timeout }, async (t) => {
  const { gateway, person } = await gatewayWithPerson(t);
  const crab = await startAgentApart(t, gateway, person, "crab");
  const rex = await startAgentApart(t, gateway, person, "rex");
  const maya = await invited(t, gateway, person, "maya");

  // Two clients ask for crab at once, one by the way in on the gateway's machine and one over the entry, and one asks for rex.
  // The agents are not asking for their calls yet, so each call waits for them.
  const beside = ask(person, localTransports(), CRAB, crab.server.serverId);
  const over = ask(maya.connection, entryTransports(entryOf(gateway)), CRAB, crab.server.serverId);
  const forRex = ask(person, localTransports(), REX, rex.server.serverId);

  // Each agent is told of its own calls and of no one else's.
  const crabCalls = await crab.waitForCalls(2);
  const [rexCall = ""] = await rex.waitForCalls(1);
  assert.equal(new Set([...crabCalls, rexCall]).size, 3, "three calls, none alike");
  // The gateway has dialed no one: the agents' own servers have heard from nobody.
  assert.equal(crab.server.connections() + rex.server.connections(), 0);

  for (const call of crabCalls) crab.answer(call);
  const [first, second] = await Promise.all([beside, over]);
  for (const reached of [first, second]) stopAfter(t, () => reached.connection.close());
  assert.equal(await first.connection.echo("one"), "echo: one");
  assert.equal(await second.connection.echo("two"), "echo: two");
  // Rex was not answered yet, and crab's answers were not mixed up with it.
  assert.equal(rex.server.connections(), 0);
  rex.answer(rexCall);
  const third = await forRex;
  stopAfter(t, () => third.connection.close());
  assert.equal(await third.connection.echo("three"), "echo: three");
  // Each answer opened one connection to the agent's own server, and the agent opened it.
  assert.equal(crab.server.connections(), 2);
  assert.equal(rex.server.connections(), 1);

  // Only the connection that registered as an agent with no socket is told of calls.
  const scout = await connectLocalGateway();
  stopAfter(t, () => scout.close());
  await joinAndRegister(scout, "scout");
  const refused = { code: "service_not_allowed" };
  await assert.rejects(person.calls(), refused, "the person who runs the gateway");
  await assert.rejects(maya.connection.calls(), refused, "an agent apart that has not registered");
  await assert.rejects(scout.calls(), refused, "an agent beside the gateway, which registered a socket");
  await assert.rejects((await connectApart(t, gateway)).calls(), refused, "a connection that signed in as no one");

  // Hanging up ends what the agent answered, on its side too.
  await first.connection.close();
  await second.connection.close();
  await eventually(() => crab.server.connections(), (open) => open === 0, { what: "crab's server to be let go of" });
});

test("a call's ID opens the answering path once, and only while its call waits", { timeout }, async (t) => {
  const { gateway, person } = await gatewayWithPerson(t);
  const { port } = entryOf(gateway);
  const crab = await startAgentApart(t, gateway, person, "crab");

  const waiting = ask(person, localTransports(), CRAB, crab.server.serverId);
  const [call = ""] = await crab.waitForCalls(1);

  // An ID that was never made, one that is nearly right, and a path that is no answering path open nothing.
  for (const path of [answerPath("made-up"), answerPath(call.slice(1)), answerPath(call.toLowerCase())]) {
    assert.equal(await handshakeStatus(port, path), 403, path);
  }
  for (const path of ["/ws/call", `${answerPath(call)}/more`]) assert.equal(await handshakeStatus(port, path), 404, path);
  // A web page can't answer, and trying doesn't spend the ID.
  assert.equal(await handshakeStatus(port, answerPath(call), { Origin: `http://127.0.0.1:${port}` }), 403);

  assert.equal(await handshakeStatus(port, answerPath(call)), 101, "the right ID opens it");
  assert.equal(await handshakeStatus(port, answerPath(call)), 403, "and only once");
  // That connection was closed at once, so the one that asked is let go.
  await assert.rejects(waiting, isDisconnected);

  // A call ends with its agent's registration, and its ID is no good after that.
  const another = ask(person, localTransports(), CRAB, crab.server.serverId);
  const [next = ""] = await crab.waitForCalls(1);
  await crab.connection.close();
  await within(10_000, assert.rejects(another, isDisconnected), "the client to be let go the moment its agent was gone");
  assert.equal(await handshakeStatus(port, answerPath(next)), 403);
});

test("a call that the agent does not answer in time ends the client's connection, whichever way the client came in", { timeout: 60_000 }, async (t) => {
  const { gateway, person } = await gatewayWithPerson(t);
  const { port } = entryOf(gateway);
  const crab = await startAgentApart(t, gateway, person, "crab");
  const maya = await invited(t, gateway, person, "maya");

  const started = Date.now();
  const beside = ask(person, localTransports(), CRAB, crab.server.serverId);
  const over = ask(maya.connection, entryTransports(entryOf(gateway)), CRAB, crab.server.serverId);
  // The agent is told of both and answers neither.
  const calls = await crab.waitForCalls(2);

  // Each client is told its connection ended, and not that it was never made: it waited at the gateway for the agent.
  await assert.rejects(beside, isDisconnected);
  await assert.rejects(over, isDisconnected);
  assert.ok(Date.now() - started >= 14_000, "after the quarter of a minute a call is good for, and not before");
  for (const call of calls) assert.equal(await handshakeStatus(port, answerPath(call)), 403, "and its ID is no good once it ran out");
  assert.equal(crab.server.connections(), 0, "the gateway never connected to the agent");

  // The agent is still registered, and a client that asks again is called for again.
  const again = ask(person, localTransports(), CRAB, crab.server.serverId);
  const [call = ""] = await crab.waitForCalls(1);
  crab.answer(call);
  const reached = await again;
  stopAfter(t, () => reached.connection.close());
  assert.equal(await reached.connection.echo("back"), "echo: back");
});

test("a connection that answers its pings is not let go of however quiet it is: the agent's registration, a client's way through to the agent and the connection that answered its call, even after the gateway was blocked for longer than it lets a connection stay silent", { timeout }, async (t) => {
  const silenceMs = 500;
  const { gateway, person } = await gatewayWithPerson(t, { silenceMs });
  const crab = await startAgentApart(t, gateway, person, "crab");
  const maya = await invited(t, gateway, person, "maya");
  const asking = ask(maya.connection, entryTransports(entryOf(gateway)), CRAB, crab.server.serverId);
  const [call = ""] = await crab.waitForCalls(1);
  crab.answer(call);
  const reached = await asking;
  stopAfter(t, () => reached.connection.close());
  assert.equal(await reached.connection.echo("first"), "echo: first");

  // Nothing is said on any of the three connections for three times as long as the gateway lets one stay silent.
  await delay(3 * silenceMs);
  assert.deepEqual((await person.list()).map((program) => program.name), ["crab"]);
  assert.equal(await crab.connection.version(), SHRIMPY_VERSION);
  assert.equal(await reached.connection.echo("later"), "echo: later");

  // A gateway that was blocked has not been listening, so nobody was silent for it, and nobody is let go of.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2 * silenceMs);
  assert.equal(await reached.connection.echo("after"), "echo: after");
  assert.equal(await crab.connection.version(), SHRIMPY_VERSION);
  assert.deepEqual((await person.list()).map((program) => program.name), ["crab"]);
});
