import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { leaveUnanswered, settle, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { GatewayRunningError } from "./index.ts";
import {
  joinAndRegister,
  startGatewayChild,
  startGatewayInProcess,
  startRegistrantChild,
  webPortOf,
} from "./testing/index.ts";

const timeout = 30_000;

test("a second gateway is refused and the first is undisturbed", { timeout }, async (t) => {
  const runtime = useRuntimeDir(t);
  const first = await startGatewayInProcess(t, { web: { port: 0 } });
  const program = await connectLocalGateway();
  let dropped = false;
  program.onDisconnect(() => {
    dropped = true;
  });
  try {
    const one = await joinAndRegister(program, "one");

    // Asking for the first gateway's own port would fail on the port, if the second tried it before the socket.
    await assert.rejects(
      startGatewayInProcess(t, { web: { port: webPortOf(first) } }),
      (error) =>
        error instanceof GatewayRunningError &&
        error.socket === first.socket &&
        error.message.includes("already running"),
    );

    // Only the first gateway's own files: its two sockets and its lock, and its ways in.
    assert.deepEqual(
      readdirSync(runtime).filter((name) => !name.startsWith("gateway") && name !== "ways"),
      [],
    );
    assert.deepEqual(await program.list(), [one]);
    assert.equal(dropped, false);
    const newcomer = await connectLocalGateway();
    try {
      assert.deepEqual(await newcomer.list(), [one]);
    } finally {
      await newcomer.close();
    }
  } finally {
    await program.close();
    await first.close();
  }
});

test("gateways started at the same moment cannot both run", { timeout }, async (t) => {
  useRuntimeDir(t);
  const results = await Promise.allSettled([startGatewayInProcess(t), startGatewayInProcess(t), startGatewayInProcess(t)]);
  try {
    const started = results.filter((result) => result.status === "fulfilled");
    const refused = results.filter((result) => result.status === "rejected");
    assert.equal(started.length, 1);
    assert.equal(refused.length, 2);
    for (const { reason } of refused) assert.ok(reason instanceof GatewayRunningError);

    const client = await connectLocalGateway();
    try {
      assert.deepEqual(await client.list(), []);
    } finally {
      await client.close();
    }
  } finally {
    for (const result of results) {
      if (result.status === "fulfilled") await result.value.close();
    }
  }
});

test("a gateway that was killed leaves its sockets, which the next one replaces or removes", { timeout }, async (t) => {
  const runtime = useRuntimeDir(t);
  const child = await startGatewayChild(t, tempDir(t, "gateway-data"));
  await startRegistrantChild(t, "victim");
  const ways = join(runtime, "ways");
  assert.equal(readdirSync(ways).length, 1, "the registered program has a way in");
  await child.kill("SIGKILL");
  assert.ok(existsSync(join(runtime, "gateway.sock")));
  assert.equal(readdirSync(ways).length, 1, "and it is left behind");

  const gateway = await startGatewayInProcess(t);
  assert.deepEqual(readdirSync(ways), [], "the next gateway starts with none");
  const client = await connectLocalGateway();
  try {
    assert.deepEqual(await client.list(), []);
  } finally {
    await client.close();
    await gateway.close();
  }
});

test("closing the gateway drops its connections and its socket, and another can start", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  const program = await connectLocalGateway();
  const ended = new Promise<void>((resolve) => program.onDisconnect(() => resolve()));
  await joinAndRegister(program, "one");

  await gateway.close();
  await gateway.close();

  await ended;
  assert.equal(existsSync(gateway.socket), false);
  await program.close();

  const again = await startGatewayInProcess(t);
  const client = await connectLocalGateway();
  try {
    assert.deepEqual(await client.list(), []);
  } finally {
    await client.close();
    await again.close();
  }
});

test("a client that is gone before the gateway's answer reaches it is not reported", { timeout }, async (t) => {
  const reported = t.mock.method(console, "error", () => undefined);
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t);
  try {
    await leaveUnanswered(gateway.socket);
    // By the time the gateway has answered this one, it is done with the one that left.
    const client = await connectLocalGateway();
    await client.list();
    await client.close();
    await settle();

    assert.deepEqual(reported.mock.calls.map((call) => call.arguments), []);
  } finally {
    await gateway.close();
  }
});

test("a gateway whose browser entry cannot start gives the socket back", { timeout }, async (t) => {
  const runtime = useRuntimeDir(t);
  const squatter = createServer();
  await new Promise<void>((resolve) => squatter.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = squatter.address() as AddressInfo;
    await assert.rejects(startGatewayInProcess(t, { web: { port } }), /EADDRINUSE/);
    await assert.rejects(startGatewayInProcess(t, { web: { port: 0, staticDir: join(runtime, "no-such-site") } }), /ENOENT/);

    const gateway = await startGatewayInProcess(t);
    await gateway.close();
  } finally {
    await new Promise<void>((resolve) => squatter.close(() => resolve()));
  }
});
