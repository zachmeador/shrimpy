import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { startTestChat } from "../contracts/chat/testing/index.ts";
import type { Program } from "../contracts/gateway/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { eventually, tempDir, within } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { isAlive, onTheRoster, shrimpy } from "./testing/index.ts";

/*
 * These tests run the gateway and the chat server as people do: every
 * `shrimpy` is its own process, the programs it serves included.
 */

const timeout = 60_000;

/** The programs linked to the gateway, as the roster lists them, once the chat server is among them. */
async function linkedWithChat(t: TestContext): Promise<Program[]> {
  const roster = await onTheRoster(t);
  return eventually(
    () => roster.programs(),
    (programs) => programs.some((program) => program.kind === "chat"),
    { what: "the chat server to link to the gateway", timeoutMs: 30_000 },
  );
}

const CHAT = { kind: "chat", name: "chat", member: null, shrimpy: SHRIMPY_VERSION };

test("the chat server links to the gateway once both run, with its version", { timeout }, async (t) => {
  await startTestGateway(t);
  await startTestChat(t);

  assert.deepEqual(await linkedWithChat(t), [CHAT]);
});

test("a gateway that was killed and started again has the chat server linked again", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  await startTestChat(t);
  await linkedWithChat(t);
  const first = gateway.listening.pid;

  await gateway.outage();
  assert.equal((await shrimpy(["status"])).code, 1);
  await gateway.recover();

  assert.deepEqual(await linkedWithChat(t), [CHAT]);
  assert.notEqual(gateway.listening.pid, first);
});

test("a chat server stops promptly when the gateway it is linked to has stopped answering", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const chat = await startTestChat(t);
  await linkedWithChat(t);

  // A stopped process still holds its sockets open, and answers nothing.
  gateway.freeze();
  const stopped = await within(5000, chat.stop(), "the chat server stopping");

  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(isAlive(chat.listening.pid), false);
});

test("a chat server with no gateway running waits for one, and stops with 0", { timeout }, async (t) => {
  const chat = await startTestChat(t);

  assert.equal((await shrimpy(["status"])).code, 1);
  const stopped = await chat.stop();
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(isAlive(chat.listening.pid), false);
});

test("a stop signal the moment they are listening stops each of them cleanly", { timeout }, async (t) => {
  const gateway = await startTestGateway(t);
  const chat = await startTestChat(t);

  const chatStopped = await chat.stop("SIGINT");
  const gatewayStopped = await gateway.stop("SIGTERM");

  assert.equal(chatStopped.code, 0, chatStopped.stderr);
  assert.equal(gatewayStopped.code, 0, gatewayStopped.stderr);
  assert.equal(isAlive(chat.listening.pid) || isAlive(gateway.listening.pid), false);
  await gateway.recover();
  assert.equal((await gateway.stop()).code, 0);
});

test("a second gateway is refused, and the first keeps serving", { timeout }, async (t) => {
  await startTestGateway(t);

  const second = await shrimpy(["gateway", "serve", "--data", tempDir(t, "gateway-other")]);

  assert.equal(second.code, 1);
  assert.equal(second.stdout, "");
  assert.equal((await shrimpy(["status"])).code, 0);
});

test("a second chat server is refused before it touches its data, and the first keeps serving", { timeout }, async (t) => {
  await startTestGateway(t);
  await startTestChat(t);
  await linkedWithChat(t);
  const otherDir = tempDir(t, "chat-other");

  const second = await shrimpy(["chat", "serve", otherDir]);

  assert.equal(second.code, 1);
  assert.equal(second.stdout, "");
  assert.deepEqual(readdirSync(otherDir), [], "a refused chat server leaves nothing in its data directory");
  assert.deepEqual(await linkedWithChat(t), [CHAT], "the first is still linked");
});

test("a chat server that reaches the data of another through a different socket is refused by the store", { timeout }, async (t) => {
  const dataDir = tempDir(t, "chat-data");
  await startTestChat(t, { dataDir });

  const second = await shrimpy(["chat", "serve", dataDir], { env: { SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-elsewhere") } });

  assert.equal(second.code, 1);
  assert.equal(second.stdout, "");
  assert.ok(second.stderr.includes(dataDir), "the data is another's");
});

test("a runtime directory too long for a socket is refused, and nothing is started", { timeout }, async (t) => {
  const runtime = join(tempDir(t, "rt"), "d".repeat(100));
  const dataDir = tempDir(t, "chat-data");

  const result = await shrimpy(["chat", "serve", dataDir], { env: { SHRIMPY_RUNTIME_DIR: runtime } });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.includes("SHRIMPY_RUNTIME_DIR"), "it names what to shorten");
});
