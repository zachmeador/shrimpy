import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { connectChat } from "../contracts/chat/index.ts";
import { connectLocal, readChatEndpoint } from "../contracts/chat/node.ts";
import { namedSocketPath } from "../lib/runtime/index.ts";
import { startChat } from "./index.ts";
import { startServer } from "./server.ts";
import { openStore, StoreOwnedError } from "./store/index.ts";
import {
  agent,
  countWatchers,
  follow,
  mainThread,
  openTestStore,
  person,
  settle,
  startTestChat,
  stopAfter,
  tempDir,
  until,
  useRuntimeDir,
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

test("a second chat server on the same data directory is refused, and the first keeps serving", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));

  await assert.rejects(startChat({ dataDir: chat.dataDir }), StoreOwnedError);

  assert.deepEqual(await zach.chat.channels(), []);
  const late = await chat.join(agent("Shrimpy"));
  assert.equal(await late.chat.head(), 0);
});

test("a second chat server on the same socket is refused, and lets go of its data directory", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const elsewhere = tempDir(t, "chat-elsewhere");

  await assert.rejects(startChat({ dataDir: elsewhere }), /already running/);

  const reopened = openStore(elsewhere);
  reopened.close();
  assert.deepEqual(await zach.chat.channels(), []);
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
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const shrimpy = await chat.join(agent("Shrimpy"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
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

test("a feed that is waiting is forgotten when its connection drops", { timeout }, async (t) => {
  useRuntimeDir(t);
  const { store, dataDir } = openTestStore(t);
  const counted = countWatchers(store);
  const server = await startServer(
    { store: counted.store, working: createWorkingMarks(), now: () => Date.now() },
    dataDir,
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
