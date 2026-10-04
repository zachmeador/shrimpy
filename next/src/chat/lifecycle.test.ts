import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { connectChat } from "../contracts/chat/index.ts";
import { connectLocal, readChatEndpoint } from "../contracts/chat/node.ts";
import { namedSocketPath } from "../lib/runtime/node.ts";
import { inRuntimeDir, leaveUnanswered, settle, stopAfter, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { ChatRunningError, startChat } from "./index.ts";
import { startServer } from "./server.ts";
import { openStore, StoreOwnedError } from "./store/index.ts";
import {
  agent,
  countWatchers,
  follow,
  mainThread,
  openTestStore,
  person,
  startChatChild,
  startDm,
  startTestChat,
} from "./testing/index.ts";
import { createWorkingMarks } from "./threads/index.ts";

const timeout = 30_000;

test("the endpoint file says where the chat server is", { timeout }, async (t) => {
  const chat = await startTestChat(t);

  const endpoint = readChatEndpoint(chat.dataDir);

  assert.deepEqual(endpoint, chat.chat.endpoint);
  assert.equal(endpoint.socket, namedSocketPath("chat"));
  assert.equal(endpoint.pid, process.pid);
  assert.match(endpoint.serverId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const connection = await connectLocal(endpoint);
  stopAfter(t, () => connection.close());
  await connection.chat.identify(person("Zach"));
});

test("a second chat server on this machine is refused for the socket, even on the same data directory, and the first keeps serving", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));

  await assert.rejects(
    startChat({ dataDir: chat.dataDir }),
    (error) => error instanceof ChatRunningError && error.socket === chat.chat.endpoint.socket,
  );

  assert.deepEqual(await zach.chat.channels(), []);
  const late = await chat.join(agent("Shrimpy"));
  assert.equal(await late.chat.head(), 0);
});

test("chat servers that share a data directory but not a runtime directory are refused by the store", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const elsewhere = tempDir(t, "rt-elsewhere");

  await assert.rejects(inRuntimeDir(elsewhere, () => startChat({ dataDir: chat.dataDir })), StoreOwnedError);

  assert.deepEqual(await zach.chat.channels(), []);
  // The refused server let go of the socket it had taken, so another can take it.
  const other = await inRuntimeDir(elsewhere, () => startChat({ dataDir: tempDir(t, "chat-other") }));
  stopAfter(t, () => other.close());
});

test("a second chat server on the same socket is refused, and leaves nothing in its data directory", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const elsewhere = tempDir(t, "chat-elsewhere");

  await assert.rejects(
    startChat({ dataDir: elsewhere }),
    (error) =>
      error instanceof ChatRunningError &&
      error.socket === chat.chat.endpoint.socket &&
      error.message.includes("already running"),
  );

  assert.deepEqual(readdirSync(elsewhere), []);
  assert.deepEqual(await zach.chat.channels(), []);
});

test("chat servers started at the same moment cannot both run", { timeout }, async (t) => {
  useRuntimeDir(t);
  for (let round = 0; round < 10; round++) {
    const dataDirs = [1, 2, 3].map((n) => tempDir(t, `chat-race-${n}`));
    const results = await Promise.allSettled(dataDirs.map((dataDir) => startChat({ dataDir })));
    const winners = results.filter((result) => result.status === "fulfilled");
    try {
      assert.equal(winners.length, 1, `round ${round}: ${winners.length} chat servers are running`);
      for (const result of results) {
        if (result.status === "rejected") assert.ok(result.reason instanceof ChatRunningError, String(result.reason));
      }

      const client = await connectLocal(winners[0]?.value.endpoint ?? assert.fail("no chat server started"));
      try {
        await client.chat.identify(person("Zach"));
        assert.deepEqual(await client.chat.channels(), []);
      } finally {
        await client.close();
      }
    } finally {
      for (const winner of winners) await winner.value.close();
    }
    // The servers that were refused made nothing, and the one that ran let go of its store.
    results.forEach((result, index) => {
      const dataDir = dataDirs[index] ?? assert.fail("a data directory is missing");
      if (result.status === "rejected") assert.deepEqual(readdirSync(dataDir), [], `round ${round}`);
      else openStore(dataDir).close();
    });
  }
});

test("a chat server that was killed leaves a socket that the next one replaces", { timeout }, async (t) => {
  useRuntimeDir(t);
  const child = await startChatChild(t, { dataDir: tempDir(t, "chat-killed") });
  await child.kill("SIGKILL");
  assert.ok(existsSync(child.endpoint.socket));

  const chat = await startChat({ dataDir: tempDir(t, "chat-next") });
  stopAfter(t, () => chat.close());
  const client = await connectLocal(chat.endpoint);
  stopAfter(t, () => client.close());
  await client.chat.identify(person("Zach"));
  assert.deepEqual(await client.chat.channels(), []);
});

test("a chat server that cannot record its endpoint does not keep listening", { timeout }, async (t) => {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "chat-data");
  writeFileSync(join(dataDir, "runtime"), "a file where the directory should be");

  await assert.rejects(startChat({ dataDir }));

  assert.equal(existsSync(namedSocketPath("chat")), false);
  rmSync(join(dataDir, "runtime"));
  const again = await startChat({ dataDir });
  stopAfter(t, () => again.close());
});

test("a restarted chat server keeps its ID, its messages and its positions", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  const first = await zach.chat.post(main.id, "before the restart", "zach-1");
  const { serverId } = chat.chat.endpoint;

  await chat.chat.close();
  assert.equal(existsSync(chat.chat.endpoint.socket), false);
  const restarted = await startChat({ dataDir: chat.dataDir });
  stopAfter(t, () => restarted.close());
  const again = await connectLocal(restarted.endpoint);
  stopAfter(t, () => again.close());
  await again.chat.identify(person("Zach"));

  assert.equal(restarted.endpoint.serverId, serverId);
  assert.deepEqual(await again.chat.channels(), [dm]);
  assert.deepEqual(await again.chat.read(main.id, null, 10), [first]);
  assert.equal(await again.chat.head(), first.seq);
  assert.deepEqual(await again.chat.post(main.id, "before the restart", "zach-1"), first);
  const next = await again.chat.post(main.id, "after the restart", "zach-2");
  assert.equal(next.seq, first.seq + 1);
});

test("nobody is working after a restart", { timeout }, async (t) => {
  const { chat, zach, shrimpy, dm, main } = await startDm(t);
  await shrimpy.chat.setWorking(main.id, true);
  assert.equal((await zach.chat.threads(dm.id))[0]?.working.length, 1);

  await chat.chat.close();
  const restarted = await startChat({ dataDir: chat.dataDir });
  stopAfter(t, () => restarted.close());
  const again = await connectLocal(restarted.endpoint);
  stopAfter(t, () => again.close());
  await again.chat.identify(person("Zach"));

  assert.deepEqual((await again.chat.threads(dm.id))[0]?.working, []);
});

test("a client that expects another server is refused", { timeout }, async (t) => {
  const chat = await startTestChat(t);

  await assert.rejects(
    connectChat({
      serverId: randomUUID(),
      transportFactory: createUnixTransportFactory({ path: chat.chat.endpoint.socket }),
    }),
    /does not match/,
  );
});

test("stopping the server ends its connections and removes its socket", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const reasons: (Error | undefined)[] = [];
  zach.onDisconnect((reason) => reasons.push(reason));
  const waiting = zach.chat.feed(0, 10);
  waiting.catch(() => undefined);
  await settle();

  await chat.chat.close();
  await settle();

  assert.equal(reasons.length, 1);
  await assert.rejects(waiting);
  assert.equal(existsSync(chat.chat.endpoint.socket), false);
});

test("a client that is gone before the chat server's answer reaches it is not reported", { timeout }, async (t) => {
  const reported = t.mock.method(console, "error", () => undefined);
  const chat = await startTestChat(t);

  await leaveUnanswered(chat.chat.endpoint.socket);
  // By the time the server has answered this one, it is done with the one that left.
  await chat.join(person("Zach"));
  await settle();

  assert.deepEqual(reported.mock.calls.map((call) => call.arguments), []);
});

test("a feed that is waiting is forgotten when its connection drops", { timeout }, async (t) => {
  useRuntimeDir(t);
  const { store, dataDir } = openTestStore(t);
  const counted = countWatchers(store);
  const server = await startServer(
    { store: counted.store, working: createWorkingMarks(), now: () => Date.now() },
    dataDir,
    namedSocketPath("chat"),
    () => undefined,
  );
  stopAfter(t, () => server.close());
  const connection = await connectLocal(server.endpoint);
  stopAfter(t, () => connection.close());
  await connection.chat.identify(agent("Shrimpy"));
  follow(connection.chat.feed(0, 10));
  await until(() => counted.watching() === 1);

  await connection.close();

  await until(() => counted.watching() === 0);
});
