import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { eventually, tempDir, within } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { type CliResult, isAlive, serveChat, serveGateway, shrimpy } from "./testing/index.ts";

/*
 * These tests run the gateway and the chat server as people do: every
 * `shrimpy` is its own process, the programs it serves included.
 */

const timeout = 60_000;

/** The programs `status` lists, each as its cells: kind, name and version. */
function listed(status: CliResult): string[][] {
  const programs = status.stdout.split("\n\n")[0] ?? "";
  return programs
    .trim()
    .split("\n")
    .slice(2)
    .map((line) => line.split(/\s{2,}/));
}

/** `status`, asked again until the chat server is on its list. */
function statusWithChat(): Promise<CliResult> {
  return eventually(
    () => shrimpy(["status"]),
    (status) => status.stdout.includes("\nchat  "),
    { what: "the chat server to link to the gateway", timeoutMs: 30_000 },
  );
}

test("status shows the chat server once both run, with its version", { timeout }, async (t) => {
  await serveGateway(t);
  await serveChat(t, tempDir(t, "chat-data"));

  const status = await statusWithChat();

  assert.equal(status.code, 0, status.stderr);
  assert.deepEqual(listed(status), [["chat", "chat", SHRIMPY_VERSION]]);
});

test("a gateway that was killed and started again has the chat server linked again", { timeout }, async (t) => {
  const first = await serveGateway(t);
  await serveChat(t, tempDir(t, "chat-data"));
  await statusWithChat();

  await first.stop("SIGKILL");
  assert.equal((await shrimpy(["status"])).code, 1);
  const second = await serveGateway(t);

  const again = await statusWithChat();
  assert.deepEqual(listed(again), [["chat", "chat", SHRIMPY_VERSION]]);
  assert.notEqual(second.listening.pid, first.listening.pid);
});

test("a chat server stops promptly when the gateway it is linked to has stopped answering", { timeout }, async (t) => {
  const gateway = await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  await statusWithChat();

  // A stopped process still holds its sockets open, and answers nothing.
  process.kill(gateway.listening.pid, "SIGSTOP");
  const stopped = await within(5000, chat.stop(), "the chat server stopping");

  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(isAlive(chat.listening.pid), false);
});

test("a chat server with no gateway running waits for one, and stops with 0", { timeout }, async (t) => {
  const chat = await serveChat(t, tempDir(t, "chat-data"));

  assert.equal((await shrimpy(["status"])).code, 1);
  const stopped = await chat.stop();
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(isAlive(chat.listening.pid), false);
});

test("a stop signal the moment they are listening stops each of them cleanly", { timeout }, async (t) => {
  const gateway = await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));

  const chatStopped = await chat.stop("SIGINT");
  const gatewayStopped = await gateway.stop("SIGTERM");

  assert.equal(chatStopped.code, 0, chatStopped.stderr);
  assert.equal(gatewayStopped.code, 0, gatewayStopped.stderr);
  assert.equal(isAlive(chat.listening.pid) || isAlive(gateway.listening.pid), false);
  const again = await serveGateway(t);
  assert.equal((await again.stop()).code, 0);
});

test("a second gateway is refused, and the first keeps serving", { timeout }, async (t) => {
  await serveGateway(t);

  const second = await shrimpy(["gateway", "serve", "--data", tempDir(t, "gateway-other")]);

  assert.equal(second.code, 1);
  assert.equal(second.stdout, "");
  assert.equal((await shrimpy(["status"])).code, 0);
});

test("a second chat server is refused before it touches its data, and the first keeps serving", { timeout }, async (t) => {
  await serveGateway(t);
  await serveChat(t, tempDir(t, "chat-data"));
  await statusWithChat();
  const otherDir = tempDir(t, "chat-other");

  const second = await shrimpy(["chat", "serve", otherDir]);

  assert.equal(second.code, 1);
  assert.equal(second.stdout, "");
  assert.deepEqual(readdirSync(otherDir), [], "a refused chat server leaves nothing in its data directory");
  assert.deepEqual(listed(await shrimpy(["status"])), [["chat", "chat", SHRIMPY_VERSION]], "the first is still linked");
});

test("a chat server that reaches the data of another through a different socket is refused by the store", { timeout }, async (t) => {
  const dataDir = tempDir(t, "chat-data");
  await serveChat(t, dataDir);

  const second = await shrimpy(["chat", "serve", dataDir], { env: { SHRIMPY_RUNTIME_DIR: tempDir(t, "rt-elsewhere") } });

  assert.equal(second.code, 1);
  assert.equal(second.stdout, "");
  assert.match(second.stderr, /Another chat server is using the data/);
});

test("a runtime directory too long for a socket is refused with what to shorten, and nothing is started", { timeout }, async (t) => {
  const runtime = join(tempDir(t, "rt"), "d".repeat(100));
  const dataDir = tempDir(t, "chat-data");

  const result = await shrimpy(["chat", "serve", dataDir], { env: { SHRIMPY_RUNTIME_DIR: runtime } });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /too long for a socket/);
  assert.match(result.stderr, /Shorten SHRIMPY_RUNTIME_DIR by at least \d+ bytes/);
});
