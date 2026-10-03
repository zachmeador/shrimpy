import assert from "node:assert/strict";
import { once } from "node:events";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { webSocketTransport } from "../../contracts/gateway/index.ts";
import { eventually, useRuntimeDir } from "../../lib/testing/index.ts";
import {
  agentUrl,
  canConnect,
  connectEcho,
  handshakeStatus,
  openEntry,
  startBytesTarget,
  startEchoProgram,
} from "../testing/index.ts";

const timeout = 30_000;

test("a client reaches a program through the pipe and makes a call", { timeout }, async (t) => {
  useRuntimeDir(t);
  const echo = await startEchoProgram(t, "echo-agent");
  const entry = await openEntry({ echo: echo.socket });
  const url = agentUrl(entry.port, "echo");
  const first = await connectEcho(echo.serverId, webSocketTransport(url));
  const second = await connectEcho(echo.serverId, webSocketTransport(url));
  try {
    assert.equal(await first.echo("hello"), "echo: hello");
    assert.equal(await second.echo("there"), "echo: there");
    assert.equal(echo.connections(), 2);
  } finally {
    await first.close();
    await second.close();
    await entry.close();
    await echo.close();
  }
});

test("a target that is not running is refused, and nothing is connected", { timeout }, async (t) => {
  const runtime = useRuntimeDir(t);
  const target = await startBytesTarget("known");
  const entry = await openEntry({ known: target.socket, ghost: join(runtime, "ghost.sock") });
  try {
    const unknown = [
      "/ws/agent/nobody",
      "/ws/chat/known",
      "/ws/gateway",
      "/ws/robot/known",
      "/ws/agent/known/extra",
      "/ws/agent/",
      "/ws/agent/%E0%A4%A",
      "/ws",
      "/",
    ];
    for (const path of unknown) assert.equal(await handshakeStatus(entry.port, path), 404, path);
    assert.equal(await handshakeStatus(entry.port, "/ws/agent/ghost"), 502);
    assert.equal(target.connections.length, 0);

    assert.equal(await handshakeStatus(entry.port, "/ws/agent/known"), 101);
  } finally {
    await entry.close();
    await target.close();
  }
});

test("a page from another origin is refused, and nothing is connected", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await startBytesTarget("known");
  const entry = await openEntry({ known: target.socket });
  try {
    const { port } = entry;
    const foreign = [
      "https://evil.example",
      "http://evil.example:80",
      `http://127.0.0.1:${port + 1}`,
      `http://localhost:${port + 1}`,
      `https://127.0.0.1:${port}`,
      "http://localhost",
      "null",
      "",
    ];
    for (const origin of foreign) {
      assert.equal(await handshakeStatus(port, "/ws/agent/known", { Origin: origin }), 403, origin);
    }
    assert.equal(target.connections.length, 0);

    for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`]) {
      assert.equal(await handshakeStatus(port, "/ws/agent/known", { Origin: origin }), 101, origin);
    }
  } finally {
    await entry.close();
    await target.close();
  }
});

test("a client that sends no Origin is not a web page, and is accepted", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await startBytesTarget("known");
  const entry = await openEntry({ known: target.socket });
  try {
    assert.equal(await handshakeStatus(entry.port, "/ws/agent/known"), 101);
  } finally {
    await entry.close();
    await target.close();
  }
});

test("it listens on loopback only", { timeout }, async (t) => {
  useRuntimeDir(t);
  const entry = await openEntry({});
  try {
    assert.ok(await canConnect("127.0.0.1", entry.port));
    const external = Object.values(networkInterfaces())
      .flat()
      .find((address) => address?.family === "IPv4" && !address.internal);
    if (external === undefined) {
      t.diagnostic("no address beyond loopback on this machine, so nothing to refuse");
      return;
    }
    assert.equal(await canConnect(external.address, entry.port), false);
  } finally {
    await entry.close();
  }
});

test("closing the entry closes every open pipe and frees the port", { timeout }, async (t) => {
  useRuntimeDir(t);
  const echo = await startEchoProgram(t, "echo-agent");
  const entry = await openEntry({ echo: echo.socket });
  const client = await connectEcho(echo.serverId, webSocketTransport(agentUrl(entry.port, "echo")));
  try {
    assert.equal(await client.echo("still here"), "echo: still here");
    const ended = new Promise<void>((resolve) => client.onDisconnect(resolve));

    await entry.close();

    await ended;
    await eventually(() => echo.connections(), (count) => count === 0);
    assert.equal(await canConnect("127.0.0.1", entry.port), false);
    await entry.close();
  } finally {
    await client.close();
    await echo.close();
  }
});

test("a refused client that never hangs up cannot keep the entry from closing", { timeout }, async (t) => {
  useRuntimeDir(t);
  const entry = await openEntry({});
  const client = connect({ host: "127.0.0.1", port: entry.port });
  client.on("error", () => undefined);
  try {
    await once(client, "connect");
    client.write(
      [
        "GET /ws/agent/nobody HTTP/1.1",
        "Host: 127.0.0.1",
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "",
        "",
      ].join("\r\n"),
    );
    const [answer] = (await once(client, "data")) as [Buffer];
    assert.match(answer.toString(), /^HTTP\/1\.1 404 /);

    await entry.close();
  } finally {
    client.destroy();
  }
});
