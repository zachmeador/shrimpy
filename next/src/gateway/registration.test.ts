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

test("registering again on a connection replaces its entry", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGateway();
  const first = await connectLocalGateway();
  const second = await connectLocalGateway();
  try {
    const one = agent("one");
    const chat: Registration = { ...agent("chat"), kind: "chat" };
    await first.register(one);
    await second.register(chat);

    const restarted = { ...one, socket: "/tmp/one-restarted.sock" };
    await first.register(restarted);

    assert.deepEqual(await second.list(), [chat, restarted]);
  } finally {
    await first.close();
    await second.close();
    await gateway.close();
  }
});

test("a registration lasts exactly as long as its connection", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGateway();
  const first = await connectLocalGateway();
  const second = await connectLocalGateway();
  const observer = await connectLocalGateway();
  let firstEnded = 0;
  first.onDisconnect(() => {
    firstEnded += 1;
  });
  try {
    const one = agent("one");
    const two = agent("two");
    await first.register(one);
    await second.register(two);
    assert.deepEqual(await observer.list(), [one, two]);

    await first.close();

    await eventually(() => observer.list(), (list) => list.length === 1);
    assert.deepEqual(await observer.list(), [two]);
    assert.equal(firstEnded, 1);
  } finally {
    await first.close();
    await second.close();
    await observer.close();
    await gateway.close();
  }
});

test("a registration disappears when its process is killed", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGateway();
  const observer = await connectLocalGateway();
  const child = await startRegistrantChild(t, "victim");
  try {
    const listed = await observer.list();
    assert.equal(listed.length, 1);
    const [victim] = listed;
    assert.equal(victim?.name, "victim");
    assert.equal(victim.pid, child.pid);

    await child.kill("SIGKILL");

    await eventually(() => observer.list(), (list) => list.length === 0);
  } finally {
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

test("connecting fails when no gateway is running, and says so", { timeout }, async (t) => {
  useRuntimeDir(t);
  await assert.rejects(
    connectLocalGateway(),
    (error) =>
      error instanceof GatewayNotRunningError &&
      error.message === "No gateway is running on this machine." &&
      /ENOENT/.test(String(error.cause)),
  );
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
