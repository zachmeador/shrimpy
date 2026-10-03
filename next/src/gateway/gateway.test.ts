import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  connectGateway,
  type Registration,
  webSocketPath,
  webSocketTransport,
} from "../contracts/gateway/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { GatewayRunningError, type RunningGateway, startGateway } from "./index.ts";
import {
  connectEcho,
  type EchoClient,
  eventually,
  freshRuntime,
  handshakeStatus,
  rawRequest,
  startChild,
  startEchoProgram,
  stop,
} from "./testing/index.ts";

const timeout = 30_000;

function agent(name: string, socket = `/tmp/${name}.sock`): Registration {
  return { kind: "agent", name, serverId: randomUUID(), socket, pid: process.pid };
}

/** The port of a gateway that was started with a browser entry. */
function webPortOf(gateway: RunningGateway): number {
  assert.ok(gateway.webPort !== undefined, "the gateway has no browser entry");
  return gateway.webPort;
}

test("a registration is listed to every client", { timeout }, async (t) => {
  freshRuntime(t);
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

test("registering again on a connection replaces its entry", { timeout }, async (t) => {
  freshRuntime(t);
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
  freshRuntime(t);
  const gateway = await startGateway();
  const first = await connectLocalGateway();
  const second = await connectLocalGateway();
  const observer = await connectLocalGateway();
  try {
    const one = agent("one");
    const two = agent("two");
    await first.register(one);
    await second.register(two);
    assert.deepEqual(await observer.list(), [one, two]);

    await first.close();

    await eventually(() => observer.list(), (list) => list.length === 1);
    assert.deepEqual(await observer.list(), [two]);
  } finally {
    await first.close();
    await second.close();
    await observer.close();
    await gateway.close();
  }
});

test("a registration disappears when its process is killed", { timeout }, async (t) => {
  freshRuntime(t);
  const gateway = await startGateway();
  const observer = await connectLocalGateway();
  const child = await startChild("registrant-child.ts", ["victim"]);
  try {
    const listed = await observer.list();
    assert.equal(listed.length, 1);
    const [victim] = listed;
    assert.equal(victim?.name, "victim");
    assert.equal(victim.pid, child.pid);

    await stop(child, "SIGKILL");

    await eventually(() => observer.list(), (list) => list.length === 0);
  } finally {
    await stop(child, "SIGKILL");
    await observer.close();
    await gateway.close();
  }
});

test("a registration that cannot be accepted is refused with the reason", { timeout }, async (t) => {
  freshRuntime(t);
  const gateway = await startGateway();
  const program = await connectLocalGateway();
  const observer = await connectLocalGateway();
  try {
    const one = agent("one");
    await assert.rejects(
      program.register({ ...one, kind: "robot" } as unknown as Registration),
      /kind must be "agent" or "chat"/,
    );
    await assert.rejects(program.register({ ...one, socket: "one.sock" }), /socket must be an absolute path/);
    assert.deepEqual(await observer.list(), []);

    await program.register(one);
    assert.deepEqual(await observer.list(), [one]);
  } finally {
    await program.close();
    await observer.close();
    await gateway.close();
  }
});

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

test("a browser reads the registry and reaches a registered program through the web entry", { timeout }, async (t) => {
  freshRuntime(t);
  const gateway = await startGateway({ web: { port: 0 } });
  const echo = await startEchoProgram("echo-agent");
  const program = await connectLocalGateway();
  // From here on, what a page would do: only the web entry.
  const base = `ws://127.0.0.1:${webPortOf(gateway)}`;
  const browser = await connectGateway({
    transportFactory: webSocketTransport(`${base}${webSocketPath("gateway")}`),
  });
  let agentClient: EchoClient | undefined;
  try {
    await program.register({
      kind: "agent",
      name: "echo",
      serverId: echo.serverId,
      socket: echo.socket,
      pid: process.pid,
    });

    const [found] = await browser.list();
    assert.equal(found?.name, "echo");
    agentClient = await connectEcho(found.serverId, webSocketTransport(`${base}${webSocketPath(found)}`));
    assert.equal(await agentClient.echo("through the gateway"), "echo: through the gateway");
  } finally {
    await agentClient?.close();
    await browser.close();
    await program.close();
    await echo.close();
    await gateway.close();
  }
});

test("a program that leaves the registry can no longer be reached from a browser", { timeout }, async (t) => {
  freshRuntime(t);
  const gateway = await startGateway({ web: { port: 0 } });
  const echo = await startEchoProgram("echo-agent");
  const program = await connectLocalGateway();
  try {
    const port = webPortOf(gateway);
    const path = webSocketPath({ kind: "agent", name: "echo" });
    assert.equal(await handshakeStatus(port, path), 404);

    await program.register({ ...agent("echo"), serverId: echo.serverId, socket: echo.socket });
    assert.equal(await handshakeStatus(port, path), 101);

    await program.close();
    await eventually(() => handshakeStatus(port, path), (status) => status === 404);
  } finally {
    await program.close();
    await echo.close();
    await gateway.close();
  }
});

test("closing the gateway closes the browser entry and every pipe through it", { timeout }, async (t) => {
  freshRuntime(t);
  const gateway = await startGateway({ web: { port: 0 } });
  const port = webPortOf(gateway);
  const browser = await connectGateway({
    transportFactory: webSocketTransport(`ws://127.0.0.1:${port}${webSocketPath("gateway")}`),
  });
  try {
    assert.deepEqual(await browser.list(), []);
    const ended = new Promise<void>((resolve) => browser.onDisconnect(() => resolve()));

    await gateway.close();

    await ended;
    await assert.rejects(handshakeStatus(port, "/ws/gateway"), /ECONNREFUSED/);
  } finally {
    await browser.close();
  }
});

test("a gateway serves its page and its pipes from one origin", { timeout }, async (t) => {
  freshRuntime(t);
  const site = mkdtempSync(join(tmpdir(), "shrimpy-site-"));
  t.after(() => rmSync(site, { recursive: true, force: true }));
  writeFileSync(join(site, "index.html"), "<h1>shrimpy</h1>");
  const gateway = await startGateway({ web: { port: 0, staticDir: site } });
  try {
    const port = webPortOf(gateway);
    const page = await rawRequest(port, "/");
    assert.equal(page.status, 200);
    assert.equal(page.body, "<h1>shrimpy</h1>");

    // Browsers send the page's origin with the handshake.
    assert.equal(await handshakeStatus(port, "/ws/gateway", { Origin: `http://127.0.0.1:${port}` }), 101);
    assert.equal(await handshakeStatus(port, "/ws/gateway", { Origin: "https://evil.example" }), 403);
  } finally {
    await gateway.close();
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
