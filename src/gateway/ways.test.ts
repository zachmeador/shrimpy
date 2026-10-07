import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { existsSync, readdirSync } from "node:fs";
import { connect, type Socket } from "node:net";
import { type TestContext, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { connectLocalGateway, localTransports, newToken, waysDirectory, wayInSocket } from "../contracts/gateway/node.ts";
import { isNotListening } from "../lib/connection/index.ts";
import { eventually, stopAfter, useRuntimeDir } from "../lib/testing/index.ts";
import {
  agentAnnouncement,
  connectEcho,
  joinAndRegister,
  startBytesTarget,
  startEchoProgram,
  startGatewayInProcess,
} from "./testing/index.ts";

const timeout = 30_000;

/** Open the way in to the agent called `name`, as a client does. */
async function enterWay(t: TestContext, name: string): Promise<Socket> {
  const client = connect(wayInSocket({ kind: "agent", name }));
  client.on("error", () => undefined);
  stopAfter(t, () => void client.destroy());
  await once(client, "connect");
  return client;
}

/** A gateway, and a plain socket registered with it as the agent called `name`, to see which bytes its way in passes. */
async function gatewayWithBytes(t: TestContext, name: string) {
  const target = await startBytesTarget(name);
  stopAfter(t, () => target.close());
  const gateway = await startGatewayInProcess(t);
  stopAfter(t, () => gateway.close());
  const program = await connectLocalGateway();
  stopAfter(t, () => program.close());
  await joinAndRegister(program, name, { ...agentAnnouncement(name), socket: target.socket });
  return target;
}

test("bytes pass through a way in unchanged in both directions, and the way closes the moment either end does", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await gatewayWithBytes(t, "bytes");

  const client = await enterWay(t, "bytes");
  await eventually(() => target.connections.length, (count) => count === 1);
  const outgoing = randomBytes(2 * 1024 * 1024);
  for (let offset = 0; offset < outgoing.length; offset += 100_000) client.write(outgoing.subarray(offset, offset + 100_000));
  await eventually(() => target.received().length, (length) => length === outgoing.length);
  assert.ok(target.received().equals(outgoing));
  const incoming = randomBytes(2 * 1024 * 1024);
  const received: Buffer[] = [];
  client.on("data", (chunk: Buffer) => received.push(chunk));
  target.connections[0]?.write(incoming);
  await eventually(() => Buffer.concat(received).length, (length) => length === incoming.length);
  assert.ok(Buffer.concat(received).equals(incoming));

  // A client that leaves, however it does it, is a program connection that closes.
  for (const how of ["end", "destroy"] as const) {
    const leaving = await enterWay(t, "bytes");
    await eventually(() => target.open(), (open) => open === 2);
    leaving[how]();
    await eventually(() => target.open(), (open) => open === 1);
  }
  // A program that closes, however it does it, is a client that closes, after what it sent.
  for (const how of ["end", "destroy"] as const) {
    const waiting = await enterWay(t, "bytes");
    const heard: string[] = [];
    waiting.on("data", (chunk: Buffer) => heard.push(chunk.toString()));
    await eventually(() => target.open(), (open) => open === 2);
    const connection = target.connections.at(-1);
    if (how === "end") connection?.end("last words");
    else connection?.destroy();
    await once(waiting, "close");
    assert.equal(heard.join(""), how === "end" ? "last words" : "");
  }
});

test("a client that stops reading slows the program down, and the gateway does not hold what was sent", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await gatewayWithBytes(t, "flood");
  const client = await enterWay(t, "flood");
  await eventually(() => target.connections.length, (count) => count === 1);
  let received = 0;
  client.on("data", (chunk: Buffer) => {
    received += chunk.length;
  });
  client.pause();

  // Write until the program's connection stops taking more for a moment.
  const connection = target.connections[0];
  assert.ok(connection);
  const chunk = Buffer.alloc(64 * 1024, 7);
  const limit = 128 * 1024 * 1024;
  let written = 0;
  while (written < limit) {
    written += chunk.length;
    if (connection.write(chunk)) continue;
    const drained = await Promise.race([once(connection, "drain").then(() => true), delay(300).then(() => false)]);
    if (!drained) break;
  }

  // Kernel buffers and a few stream buffers hold some, but nowhere near all of it.
  assert.ok(written < limit / 4, `${written} bytes went in before the pipe pushed back`);
  client.resume();
  await eventually(() => received, (bytes) => bytes === written);
});

test("a program that registers again after a restart is reached by the same name, and no way in is left behind", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  stopAfter(t, () => gateway.close());
  const ways = (): string[] => (existsSync(waysDirectory()) ? readdirSync(waysDirectory()) : []);
  // The ways in on this machine ask for no ticket.
  const reach = (serverId: string) =>
    connectEcho(serverId, localTransports().program({ kind: "agent", name: "echo" }, ""));
  // The same agent each time it starts: it joins once, and signs in with its token after.
  const token = newToken();

  // The first run of the program, reached by its name, and then gone.
  const first = await startEchoProgram(t, "echo-one");
  const before = await connectLocalGateway();
  await before.join("echo", token);
  await before.register({ ...agentAnnouncement("echo"), serverId: first.serverId, socket: first.socket });
  const one = await reach(first.serverId);
  assert.equal(await one.echo("hello"), "echo: hello");
  assert.equal(ways().length, 1);
  await one.close();
  await before.close();
  await first.close();
  await eventually(() => ways(), (left) => left.length === 0);
  await assert.rejects(reach(first.serverId), isNotListening);

  // The second run signs in as the same member, registers under the same name, and is the one reached.
  const second = await startEchoProgram(t, "echo-two");
  const after = await connectLocalGateway();
  stopAfter(t, () => after.close());
  await after.signIn(token, "echo");
  await after.register({ ...agentAnnouncement("echo"), serverId: second.serverId, socket: second.socket });
  const two = await reach(second.serverId);
  stopAfter(t, () => two.close());

  assert.equal(await two.echo("again"), "echo: again");
  assert.equal(ways().length, 1, "one way in for the one name");
  await assert.rejects(reach(first.serverId), /does not match/, "and it leads to the program that is running now");
});
