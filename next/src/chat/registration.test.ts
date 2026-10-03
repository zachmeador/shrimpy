import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { Gateway, GATEWAY_SOCKET_NAME } from "../contracts/gateway/index.ts";
import { startStandInGateway } from "../contracts/gateway/testing/index.ts";
import { offer, startStandIn, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { ChatRunningError, startChat } from "./index.ts";
import { StoreOwnedError } from "./store/index.ts";
import { agent, mainThread, person, startTestChat, texts } from "./testing/index.ts";

const timeout = 30_000;

test("asked to register, the chat server tells the gateway where it is and which version it runs", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);

  const chat = await startTestChat(t, { register: true });

  await until(() => gateway.registered().length === 1, "the chat server to register");
  const { serverId, socket, pid } = chat.chat.endpoint;
  assert.deepEqual(gateway.registered(), [
    { kind: "chat", name: "chat", serverId, socket, pid, version: SHRIMPY_VERSION },
  ]);
});

test("closing the chat server ends its registration", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const chat = await startTestChat(t, { register: true });
  await until(() => gateway.registered().length === 1, "the chat server to register");

  await chat.chat.close();

  await until(() => gateway.connections() === 0, "the connection to the gateway to close");
  assert.deepEqual(gateway.registered(), []);
});

test("a chat server that is not asked to register does not go to the gateway", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);

  await startTestChat(t);
  await delay(100);

  assert.deepEqual(gateway.received, []);
  assert.equal(gateway.connections(), 0);
});

test("with no gateway running, the chat server starts, serves and closes quietly", { timeout }, async (t) => {
  const reported = t.mock.method(console, "error", () => undefined);

  const chat = await startTestChat(t, { register: true });
  const zach = await chat.join(person("Zach"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  await zach.chat.post(main.id, "Is anyone there?", "zach-1");
  // Long enough for it to have looked for the gateway more than once.
  await delay(300);
  assert.deepEqual(texts(await zach.chat.read(main.id, null, 10)), ["Is anyone there?"]);
  await chat.chat.close();

  assert.equal(reported.mock.callCount(), 0);
});

test("a registration that fails is reported on standard error, with what it was", { timeout }, async (t) => {
  useRuntimeDir(t);
  // Something on the gateway's socket that answers as someone else.
  await startStandIn(t, GATEWAY_SOCKET_NAME, {
    offer: () => offer(Gateway, { register: () => Promise.resolve(), list: () => Promise.resolve([]) }),
  });
  const reported = t.mock.method(console, "error", () => undefined);

  await startTestChat(t, { register: true });

  await until(() => reported.mock.callCount() > 0, "the failure to be reported");
  const first: unknown[] = reported.mock.calls[0]?.arguments ?? [];
  assert.equal(first[0], "[chat]");
  assert.match(String(first[1]), /^Could not register with the gateway: .*does not match/);
});

test("a chat server that started before the gateway registers once the gateway is up", { timeout }, async (t) => {
  useRuntimeDir(t);
  const chat = await startTestChat(t, { register: true });
  await delay(50);

  const gateway = await startStandInGateway(t);

  await until(() => gateway.registered().length === 1, "the chat server to register");
  assert.equal(gateway.registered()[0]?.serverId, chat.chat.endpoint.serverId);
});

test("the chat server keeps serving while the gateway is away, and registers again when it is back", { timeout }, async (t) => {
  useRuntimeDir(t);
  const first = await startStandInGateway(t);
  const chat = await startTestChat(t, { register: true });
  const zach = await chat.join(person("Zach"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  await until(() => first.registered().length === 1, "the chat server to register");

  await first.close();
  const whileAway = await zach.chat.post(main.id, "The gateway is gone.", "zach-1");
  const second = await startStandInGateway(t);

  await until(() => second.registered().length === 1, "the chat server to register again");
  assert.deepEqual(second.registered(), first.received);
  assert.deepEqual(await zach.chat.read(main.id, null, 10), [whileAway]);
});

test("a chat server that is refused never registers", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const chat = await startTestChat(t, { register: true });
  await until(() => gateway.registered().length === 1, "the chat server to register");

  await assert.rejects(startChat({ dataDir: chat.dataDir, register: true }), StoreOwnedError);
  await assert.rejects(startChat({ dataDir: tempDir(t, "chat-other"), register: true }), ChatRunningError);
  await delay(100);

  assert.equal(gateway.received.length, 1);
  assert.equal(gateway.connections(), 1);
});
