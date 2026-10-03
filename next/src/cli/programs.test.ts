import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connectLocal } from "../contracts/chat/node.ts";
import { eventually, stopAfter, tempDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { type CliResult, serveChat, serveGateway, shrimpy } from "./testing/index.ts";

/*
 * These tests run the gateway and the chat server as people do: every
 * `shrimpy` is its own process, the programs it serves included.
 */

const timeout = 60_000;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The programs `gateway status` lists, each as its cells: kind, name, version and pid. */
function listed(status: CliResult): string[][] {
  return status.stdout
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.split(/\s{2,}/));
}

/** `gateway status`, asked again until the chat server is on its list. */
function statusWithChat(): Promise<CliResult> {
  return eventually(
    () => shrimpy(["gateway", "status"]),
    (status) => status.stdout.includes("\nchat  "),
    { what: "the chat server to be registered with the gateway", timeoutMs: 30_000 },
  );
}

test("gateway status shows the chat server once both run, with its version and pid", { timeout }, async (t) => {
  const gateway = await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));

  const status = await statusWithChat();

  assert.equal(status.code, 0, status.stderr);
  assert.deepEqual(listed(status), [["chat", "chat", SHRIMPY_VERSION, String(chat.listening.pid)]]);
  assert.equal(gateway.listening.webPort, null);
});

test("stopping the chat server takes it off the gateway's list", { timeout }, async (t) => {
  await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  await statusWithChat();

  assert.equal((await chat.stop()).code, 0);

  const status = await eventually(
    () => shrimpy(["gateway", "status"]),
    (result) => result.stdout.includes("No programs are registered."),
    { what: "the chat server to leave the gateway's list" },
  );
  assert.equal(status.code, 0);
});

test("a gateway that was killed and started again has the chat server registered again", { timeout }, async (t) => {
  const first = await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  await statusWithChat();

  await first.stop("SIGKILL");
  const gone = await shrimpy(["gateway", "status"]);
  assert.equal(gone.code, 1);
  assert.equal(gone.stderr.trim(), "No gateway is running on this machine. Start one with: shrimpy gateway serve");
  const second = await serveGateway(t);

  const again = await statusWithChat();
  assert.deepEqual(listed(again), [["chat", "chat", SHRIMPY_VERSION, String(chat.listening.pid)]]);
  assert.notEqual(second.listening.pid, first.listening.pid);
});

test("a chat server with no gateway running serves, and stops with 0", { timeout }, async (t) => {
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  const connection = await connectLocal(chat.listening);
  stopAfter(t, () => connection.close());
  await connection.chat.identify({ id: "person:zach", kind: "person", name: "Zach" });
  const dm = await connection.chat.openDm({ id: "agent:shrimpy", kind: "agent", name: "Shrimpy" });
  const [main] = await connection.chat.threads(dm.id);
  assert.ok(main);

  await connection.chat.post(main.id, "Is anyone there?", "zach-1");

  assert.equal((await shrimpy(["gateway", "status"])).code, 1);
  assert.deepEqual((await connection.chat.read(main.id, null, 10)).map((message) => message.text), ["Is anyone there?"]);
  await connection.close();
  const stopped = await chat.stop();
  assert.equal(stopped.code, 0, stopped.stderr);
  assert.equal(stopped.stdout.trim().split("\n").length, 1, "serve prints only the listening line");
  assert.equal(stopped.stderr, "", "a chat server with no gateway has nothing to complain about");
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

test("a second gateway is refused with the gateway's own message, and the first keeps serving", { timeout }, async (t) => {
  const first = await serveGateway(t);

  const second = await shrimpy(["gateway", "serve"]);

  assert.equal(second.code, 1);
  assert.equal(second.stdout, "");
  assert.equal(
    second.stderr.trim(),
    `A gateway is already running on ${first.listening.socket}. Use that one, or stop it before starting another.`,
  );
  assert.equal((await shrimpy(["gateway", "status"])).code, 0);
});

test("a second chat server is refused with the chat server's own message, and the first keeps serving", { timeout }, async (t) => {
  const dataDir = tempDir(t, "chat-data");
  const first = await serveChat(t, dataDir);

  const sameData = await shrimpy(["chat", "serve", dataDir]);
  const otherData = await shrimpy(["chat", "serve", tempDir(t, "chat-other")]);

  assert.equal(sameData.code, 1);
  assert.equal(
    sameData.stderr.trim(),
    `Another chat server is using the data in ${dataDir}. Talk to that server instead of opening its store.`,
  );
  assert.equal(otherData.code, 1);
  assert.equal(
    otherData.stderr.trim(),
    `A chat server is already running on ${first.listening.socket}. Use that one, or stop it before starting another.`,
  );
  assert.equal(sameData.stdout + otherData.stdout, "");
  const connection = await connectLocal(first.listening);
  stopAfter(t, () => connection.close());
  await connection.chat.identify({ id: "person:zach", kind: "person", name: "Zach" });
});

test("the browser entry opens only when a port is given, and serves the web client's files", { timeout }, async (t) => {
  const site = tempDir(t, "site");
  writeFileSync(join(site, "index.html"), "<p>hello from the web client</p>");
  const without = await serveGateway(t);
  assert.equal(without.listening.webPort, null);
  assert.equal((await without.stop()).code, 0);

  const gateway = await serveGateway(t, ["--web-port", "0", "--web-dir", site]);

  const port = gateway.listening.webPort;
  assert.ok(typeof port === "number" && port > 0, `the entry listens on ${String(port)}`);
  const page = await fetch(`http://127.0.0.1:${String(port)}/`);
  assert.equal(await page.text(), "<p>hello from the web client</p>");
  assert.equal((await gateway.stop()).code, 0);
});
