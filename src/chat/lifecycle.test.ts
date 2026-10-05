import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { connectToSocket } from "../contracts/chat/testing/index.ts";
import { namedSocketPath } from "../lib/runtime/node.ts";
import { inRuntimeDir, leaveUnanswered, settle, stopAfter, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { ChatRunningError, startChat } from "./index.ts";
import { startServer } from "./server.ts";
import { openStore, StoreOwnedError } from "./store/index.ts";
import {
  agent,
  countWatchers,
  follow,
  identityOf,
  openTestStore,
  startChatChild,
  startTestChat,
} from "./testing/index.ts";
import { createWorkingMarks } from "./threads/index.ts";

const timeout = 30_000;

test("a second chat server on this machine is refused for the socket, even on the same data directory, and the first keeps serving", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();

  await assert.rejects(
    startChat({ dataDir: chat.dataDir }),
    (error) => error instanceof ChatRunningError && error.socket === chat.chat.socket,
  );

  assert.deepEqual(await zach.chat.channels(), []);
  const late = await chat.agent("Shrimpy");
  assert.equal(await late.chat.head(), 0);
});

test("chat servers that share a data directory but not a runtime directory are refused by the store", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const elsewhere = tempDir(t, "rt-elsewhere");

  await assert.rejects(inRuntimeDir(elsewhere, () => startChat({ dataDir: chat.dataDir })), StoreOwnedError);

  assert.deepEqual(await zach.chat.channels(), []);
  // The refused server let go of the socket it had taken, so another can take it.
  const other = await inRuntimeDir(elsewhere, () => startChat({ dataDir: tempDir(t, "chat-other") }));
  stopAfter(t, () => other.close());
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

      // The one that runs answers on its socket.
      await (await connectToSocket(winners[0]?.value ?? assert.fail("no chat server started"))).close();
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
  assert.ok(existsSync(child.socket));

  const chat = await startChat({ dataDir: tempDir(t, "chat-next") });
  stopAfter(t, () => chat.close());
  await (await connectToSocket(chat)).close();
});

test("stopping the server ends its connections and removes its socket", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const reasons: (Error | undefined)[] = [];
  zach.onDisconnect((reason) => reasons.push(reason));
  const waiting = zach.chat.feed(0, 10);
  waiting.catch(() => undefined);
  // The server takes up a connection's calls in order, so once it has answered this one it has the feed.
  await zach.chat.head();

  await chat.chat.close();
  await until(() => reasons.length > 0, "the client to be told its connection ended");

  assert.equal(reasons.length, 1);
  await assert.rejects(waiting);
  assert.equal(existsSync(chat.chat.socket), false);
});

test("a client that is gone before the chat server's answer reaches it is not reported", { timeout }, async (t) => {
  const reported = t.mock.method(console, "error", () => undefined);
  const chat = await startTestChat(t);

  await leaveUnanswered(chat.chat.socket);
  // By the time the server has answered this one, it is done with the one that left.
  await chat.person();
  await settle();

  assert.deepEqual(reported.mock.calls.map((call) => call.arguments), []);
});

test("a feed that is waiting is forgotten when its connection drops", { timeout }, async (t) => {
  useRuntimeDir(t);
  const { store } = openTestStore(t);
  const counted = countWatchers(store);
  const shrimpy = agent("Shrimpy");
  const socket = namedSocketPath("chat");
  const server = await startServer(
    { store: counted.store, working: createWorkingMarks(), identity: identityOf(shrimpy), now: () => Date.now() },
    socket,
    () => undefined,
  );
  stopAfter(t, () => server.close());
  const connection = await connectToSocket({ serverId: server.serverId, socket });
  stopAfter(t, () => connection.close());
  await connection.chat.enter("any-ticket");
  follow(connection.chat.feed(0, 10));
  await until(() => counted.watching() === 1);

  await connection.close();

  await until(() => counted.watching() === 0);
});
