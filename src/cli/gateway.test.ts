import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { Registration } from "../contracts/gateway/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { type StandInGatewayOptions, startStandInGateway } from "../contracts/gateway/testing/index.ts";
import { stopAfter, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { runCli } from "./index.ts";
import { captureIo } from "./testing/index.ts";

const timeout = 15_000;

/** Run `shrimpy` with `args` in this process and return the code with what it printed. */
async function run(...args: string[]) {
  const cli = captureIo();
  const code = await runCli(args, cli.io);
  return { code, out: cli.out, err: cli.err };
}

const program = (kind: Registration["kind"], name: string, version: string, pid: number): Registration => ({
  kind,
  name,
  serverId: "00000000-0000-4000-8000-000000000000",
  socket: `/tmp/${name}.sock`,
  pid,
  version,
});

/** A gateway with these programs registered, each over a connection of its own that stays open. */
async function gatewayWith(t: TestContext, programs: Registration[], options?: StandInGatewayOptions) {
  useRuntimeDir(t);
  await startStandInGateway(t, options);
  for (const registration of programs) {
    const connection = await connectLocalGateway();
    stopAfter(t, () => connection.close());
    await connection.register(registration);
  }
}

test("status lists each program with its kind, name, version and pid", { timeout }, async (t) => {
  await gatewayWith(t, [
    program("chat", "chat", SHRIMPY_VERSION, 4242),
    program("agent", "scout", SHRIMPY_VERSION, 51_000),
  ]);

  const result = await run("gateway", "status");

  assert.equal(result.code, 0);
  assert.deepEqual(result.err, []);
  assert.deepEqual(result.out, [
    "kind   name   version  pid",
    `chat   chat   ${SHRIMPY_VERSION}    4242`,
    `agent  scout  ${SHRIMPY_VERSION}    51000`,
  ]);
});

test("status marks a version that differs from the command's own", { timeout }, async (t) => {
  await gatewayWith(t, [
    program("chat", "chat", SHRIMPY_VERSION, 4242),
    program("agent", "scout", "9.9.9", 51_000),
    program("agent", "newer", "0.0.0-next", 52_000),
  ]);

  const result = await run("gateway", "status");

  assert.equal(result.code, 0);
  assert.deepEqual(result.out, [
    "kind   name   version     pid",
    `chat   chat   ${SHRIMPY_VERSION}       4242`,
    `agent  scout  9.9.9       51000  (differs from this command's ${SHRIMPY_VERSION})`,
    `agent  newer  0.0.0-next  52000  (differs from this command's ${SHRIMPY_VERSION})`,
  ]);
});

test("status warns on standard error when the gateway runs another version, and still lists", { timeout }, async (t) => {
  await gatewayWith(t, [program("chat", "chat", SHRIMPY_VERSION, 4242)], { version: "9.9.9" });

  const result = await run("gateway", "status");

  assert.equal(result.code, 0);
  assert.deepEqual(result.err, [
    `Warning: the gateway runs Shrimpy 9.9.9, but this command is ${SHRIMPY_VERSION}. Programs are meant to be upgraded together.`,
  ]);
  assert.deepEqual(result.out, [
    "kind  name  version  pid",
    `chat  chat  ${SHRIMPY_VERSION}    4242`,
  ]);
});

test("status says so when nothing is registered", { timeout }, async (t) => {
  await gatewayWith(t, []);

  const result = await run("gateway", "status");

  assert.equal(result.code, 0);
  assert.deepEqual(result.out, ["No programs are registered."]);
});

test("status says no gateway is running and how to start one, and exits with 1", { timeout }, async (t) => {
  useRuntimeDir(t);

  const result = await run("gateway", "status");

  assert.equal(result.code, 1);
  assert.deepEqual(result.out, []);
  assert.deepEqual(result.err, ["No gateway is running on this machine. Start one with: shrimpy gateway serve"]);
});
