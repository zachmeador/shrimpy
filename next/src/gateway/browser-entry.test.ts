import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { connectGateway, webSocketPath, webSocketTransport } from "../contracts/gateway/index.ts";
import { connectLocalGateway } from "../contracts/gateway/node.ts";
import { startGateway } from "./index.ts";
import {
  agentRegistration as agent,
  connectEcho,
  type EchoClient,
  eventually,
  freshRuntime,
  handshakeStatus,
  rawRequest,
  startEchoProgram,
  webPortOf,
} from "./testing/index.ts";

const timeout = 30_000;

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
    await program.register({ ...agent("echo"), serverId: echo.serverId, socket: echo.socket });

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

test("a browser can list programs but cannot register one", { timeout }, async (t) => {
  freshRuntime(t);
  const gateway = await startGateway({ web: { port: 0 } });
  const port = webPortOf(gateway);
  const browser = await connectGateway({
    transportFactory: webSocketTransport(`ws://127.0.0.1:${port}${webSocketPath("gateway")}`),
  });
  try {
    await assert.rejects(browser.register(agent("planted")), /Only a program on the gateway's machine/);

    assert.deepEqual(await browser.list(), []);
    assert.equal(await handshakeStatus(port, webSocketPath({ kind: "agent", name: "planted" })), 404);
  } finally {
    await browser.close();
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
