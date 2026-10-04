import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { connectGateway, type Registration } from "../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError } from "../contracts/gateway/node.ts";
import { eventually, useRuntimeDir } from "../lib/testing/index.ts";
import { startGateway } from "./index.ts";
import { agentRegistration as agent, startEchoProgram, startRegistrantChild } from "./testing/index.ts";

const timeout = 30_000;

test("a registration is listed to every client", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGateway();
  const program = await connectLocalGateway();
  const observer = await connectLocalGateway();
  try {
    assert.deepEqual(await observer.list(), []);

    const researcher = agent("researcher");
    await program.register(researcher);

    assert.deepEqual(await observer.list(), [researcher]);
    assert.deepEqual(await program.list(), [researcher]);
  } finally {
    await program.close();
    await observer.close();
    await gateway.close();
  }
});

test("every version is listed as it was given, and none is refused", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGateway();
  const first = await connectLocalGateway();
  const second = await connectLocalGateway();
  try {
    const current = { ...agent("current"), version: "0.0.0" };
    const ahead = { ...agent("ahead"), version: "99.0.0-next.1" };
    await first.register(current);
    await second.register(ahead);

    assert.deepEqual(await first.list(), [current, ahead]);
  } finally {
    await first.close();
    await second.close();
    await gateway.close();
  }
});

test("a registration lasts as long as its connection: it is gone when its process is killed, and the others stay", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGateway();
  const observer = await connectLocalGateway();
  const stays = await connectLocalGateway();
  const child = await startRegistrantChild(t, "victim");
  try {
    const staying = agent("stays");
    await stays.register(staying);
    const listed = await observer.list();
    assert.deepEqual(listed.map((program) => program.name), ["victim", "stays"]);
    assert.equal(listed[0]?.pid, child.pid);

    await child.kill("SIGKILL");

    await eventually(() => observer.list(), (list) => list.length === 1);
    assert.deepEqual(await observer.list(), [staying]);
  } finally {
    await stays.close();
    await observer.close();
    await gateway.close();
  }
});

test("a registration that cannot be accepted is refused with the reason", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGateway();
  const program = await connectLocalGateway();
  const observer = await connectLocalGateway();
  try {
    const one = agent("one");
    await assert.rejects(program.register({ ...one, kind: "robot" } as unknown as Registration), {
      code: "service_invalid_value",
      message: 'Invalid registration: kind must be "agent" or "chat"',
    });
    await assert.rejects(program.register({ ...one, socket: "one.sock" }), {
      code: "service_invalid_value",
      message: "Invalid registration: socket must be an absolute path",
    });
    assert.deepEqual(await observer.list(), []);

    await program.register(one);
    assert.deepEqual(await observer.list(), [one]);
  } finally {
    await program.close();
    await observer.close();
    await gateway.close();
  }
});

test("connecting fails as no gateway running when nothing listens", { timeout }, async (t) => {
  useRuntimeDir(t);
  await assert.rejects(connectLocalGateway(), GatewayNotRunningError);
});

test("a gateway client refuses a server that is not the gateway", { timeout }, async (t) => {
  useRuntimeDir(t);
  const echo = await startEchoProgram(t, "echo-agent");
  try {
    await assert.rejects(
      connectGateway({ transportFactory: createUnixTransportFactory({ path: echo.socket }) }),
      /does not match/,
    );
    await eventually(() => echo.connections(), (count) => count === 0);
  } finally {
    await echo.close();
  }
});
