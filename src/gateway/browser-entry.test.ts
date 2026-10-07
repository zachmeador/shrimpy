import assert from "node:assert/strict";
import { test } from "node:test";
import { connectGateway, webSocketPath, webSocketTransport } from "../contracts/gateway/index.ts";
import { connectLocalGateway, newToken } from "../contracts/gateway/node.ts";
import { eventually, useRuntimeDir } from "../lib/testing/index.ts";
import {
  agentAnnouncement as agent,
  joinAndRegister,
  connectEcho,
  type EchoClient,
  handshakeStatus,
  startEchoProgram,
  startGatewayInProcess,
  webPortOf,
} from "./testing/index.ts";

const timeout = 30_000;

test("a browser reads the registry and reaches a registered program through the web entry", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t, { web: { port: 0 } });
  const echo = await startEchoProgram(t, "echo-agent");
  const program = await connectLocalGateway();
  // From here on, what a page would do: only the web entry.
  const base = `ws://127.0.0.1:${webPortOf(gateway)}`;
  const browser = await connectGateway({
    transportFactory: webSocketTransport(`${base}${webSocketPath("gateway")}`),
  });
  let agentClient: EchoClient | undefined;
  try {
    await joinAndRegister(program, "echo", { ...agent("echo"), serverId: echo.serverId, socket: echo.socket });

    const [found] = await browser.list();
    assert.equal(found?.name, "echo");
    agentClient = await connectEcho(echo.serverId, webSocketTransport(`${base}${webSocketPath(found)}`));
    assert.equal(await agentClient.echo("through the gateway"), "echo: through the gateway");
  } finally {
    await agentClient?.close();
    await browser.close();
    await program.close();
    await echo.close();
    await gateway.close();
  }
});

test("a browser can list programs and the roster, but cannot register a program, join, sign in, invite or ask for a ticket", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t, { web: { port: 0 } });
  const port = webPortOf(gateway);
  const browser = await connectGateway({
    transportFactory: webSocketTransport(`ws://127.0.0.1:${port}${webSocketPath("gateway")}`),
  });
  try {
    await assert.rejects(browser.register(agent("planted")), { code: "service_not_allowed" });
    await assert.rejects(browser.join("planted", newToken()), { code: "service_not_allowed" });
    await assert.rejects(browser.signIn("a-token", null), { code: "service_not_allowed" });
    await assert.rejects(browser.inviteMachine(), { code: "service_not_allowed" });
    await assert.rejects(browser.joinMachine(newToken(), "AAAA-AAAA"), { code: "service_not_allowed" });
    await assert.rejects(browser.ticket({ kind: "chat", name: "chat" }), { code: "service_not_allowed" });

    assert.deepEqual(await browser.list(), []);
    assert.deepEqual((await browser.members()).map((member) => member.kind), ["person"]);
    assert.equal(await handshakeStatus(port, webSocketPath({ kind: "agent", name: "planted" })), 404);
  } finally {
    await browser.close();
    await gateway.close();
  }
});

test("a program that leaves the registry can no longer be reached from a browser", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startGatewayInProcess(t, { web: { port: 0 } });
  const echo = await startEchoProgram(t, "echo-agent");
  const program = await connectLocalGateway();
  try {
    const port = webPortOf(gateway);
    const path = webSocketPath({ kind: "agent", name: "echo" });
    assert.equal(await handshakeStatus(port, path), 404);

    await joinAndRegister(program, "echo", { ...agent("echo"), serverId: echo.serverId, socket: echo.socket });
    assert.equal(await handshakeStatus(port, path), 101);

    await program.close();
    await eventually(() => handshakeStatus(port, path), (status) => status === 404);
  } finally {
    await program.close();
    await echo.close();
    await gateway.close();
  }
});
