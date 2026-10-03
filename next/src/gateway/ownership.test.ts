import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { GatewayRunningError, startGateway } from "./index.ts";
import {
  agentRegistration as agent,
  freshRuntime,
  startChild,
  stop,
  webPortOf,
} from "./testing/index.ts";

const timeout = 30_000;

test("a second gateway is refused and the first is undisturbed", { timeout }, async (t) => {
  const runtime = freshRuntime(t);
  const first = await startGateway({ web: { port: 0 } });
  const program = await connectLocalGateway();
  let dropped = false;
  program.onDisconnect(() => {
    dropped = true;
  });
  try {
    const one = agent("one");
    await program.register(one);

    // Asking for the first gateway's own port would fail on the port, if the second tried it before the socket.
    await assert.rejects(
      startGateway({ web: { port: webPortOf(first) } }),
      (error) =>
        error instanceof GatewayRunningError &&
        error.socket === first.socket &&
        error.message.includes("already running"),
    );

    assert.deepEqual(
      readdirSync(runtime).filter((name) => !name.startsWith("gateway.sock")),
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
  freshRuntime(t);
  const results = await Promise.allSettled([startGateway(), startGateway(), startGateway()]);
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

test("a gateway that was killed leaves a socket that the next one replaces", { timeout }, async (t) => {
  const runtime = freshRuntime(t);
  const child = await startChild("gateway-child.ts");
  await stop(child, "SIGKILL");
  assert.ok(existsSync(join(runtime, "gateway.sock")));

  const gateway = await startGateway();
  const client = await connectLocalGateway();
  try {
    assert.deepEqual(await client.list(), []);
  } finally {
    await client.close();
    await gateway.close();
  }
});

test("closing the gateway drops its connections and its socket, and another can start", { timeout }, async (t) => {
  freshRuntime(t);
  const gateway = await startGateway();
  const program = await connectLocalGateway();
  const ended = new Promise<void>((resolve) => program.onDisconnect(() => resolve()));
  await program.register(agent("one"));

  await gateway.close();

  await ended;
  assert.equal(existsSync(gateway.socket), false);
  await program.close();

  const again = await startGateway();
  const client = await connectLocalGateway();
  try {
    assert.deepEqual(await client.list(), []);
  } finally {
    await client.close();
    await again.close();
  }
});

test("a gateway without a browser entry opens no port", { timeout }, async (t) => {
  freshRuntime(t);
  const gateway = await startGateway();
  try {
    assert.equal(gateway.webPort, undefined);
  } finally {
    await gateway.close();
  }
});

test("a gateway whose browser entry cannot start gives the socket back", { timeout }, async (t) => {
  freshRuntime(t);
  const squatter = createServer();
  await new Promise<void>((resolve) => squatter.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = squatter.address() as AddressInfo;
    await assert.rejects(startGateway({ web: { port } }), /EADDRINUSE/);
    await assert.rejects(startGateway({ web: { port: 0, staticDir: join(tmpdir(), "no-such-site") } }), /ENOENT/);

    const gateway = await startGateway();
    await gateway.close();
  } finally {
    await new Promise<void>((resolve) => squatter.close(() => resolve()));
  }
});
