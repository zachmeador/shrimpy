import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import type { Message } from "../contracts/chat/index.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { startChat } from "./index.ts";
import { StoreOwnedError } from "./store/index.ts";
import {
  agent,
  joinEndpoint,
  mainThread,
  person,
  readAll,
  startChatChild,
} from "./testing/index.ts";

const timeout = 60_000;

for (const signal of ["SIGKILL", "SIGTERM"] as const) {
  test(`messages, cursors and the server's ID survive it being stopped with ${signal}`, { timeout }, async (t) => {
    useRuntimeDir(t);
    const dataDir = tempDir(t, "chat-data");
    const first = await startChatChild(t, { dataDir });
    const zach = await joinEndpoint(t, first.endpoint, person("Zach"));
    const shrimpy = await joinEndpoint(t, first.endpoint, agent("Shrimpy"));
    const dm = await zach.chat.openDm(agent("Shrimpy"));
    const main = await mainThread(zach, dm.id);
    const one = await zach.chat.post(main.id, "one", "zach-1");
    const two = await zach.chat.post(main.id, "two", "zach-2");
    const [taken] = await shrimpy.chat.feed(0, 1);
    assert.deepEqual(taken, one);
    await shrimpy.chat.setWorking(main.id, true);
    const dropped = Promise.all(
      [zach, shrimpy].map((connection) => new Promise((resolve) => connection.onDisconnect(resolve))),
    );

    await first.kill(signal);
    await dropped;
    assert.equal(existsSync(first.endpoint.socket), signal === "SIGKILL");
    const second = await startChatChild(t, { dataDir });
    const zachAgain = await joinEndpoint(t, second.endpoint, person("Zach"));
    const shrimpyAgain = await joinEndpoint(t, second.endpoint, agent("Shrimpy"));

    assert.equal(second.endpoint.serverId, first.endpoint.serverId);
    assert.equal(second.endpoint.socket, first.endpoint.socket);
    assert.notEqual(second.endpoint.pid, first.endpoint.pid);
    assert.deepEqual(await zachAgain.chat.channels(), [dm]);
    assert.deepEqual(await zachAgain.chat.read(main.id, null, 10), [one, two]);
    assert.equal(await shrimpyAgain.chat.head(), two.seq);
    // The agent's cursor still means the same: what it had not taken in, then what comes next.
    assert.deepEqual(await shrimpyAgain.chat.feed(one.seq, 10), [two]);
    const waiting = shrimpyAgain.chat.feed(two.seq, 10);
    const three = await zachAgain.chat.post(main.id, "three", "zach-3");
    assert.equal(three.seq, two.seq + 1);
    assert.deepEqual(await waiting, [three]);
    assert.deepEqual(await zachAgain.chat.post(main.id, "two", "zach-2"), two);
    assert.deepEqual((await zachAgain.chat.threads(dm.id))[0]?.working, []);
    const watching = await zachAgain.attach(main.id);
    assert.deepEqual(watching.view.messages, [one, two, three]);
  });
}

test("posts that were acknowledged survive a kill, and retrying every post leaves one of each", { timeout }, async (t) => {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "chat-data");
  const first = await startChatChild(t, { dataDir });
  const zach = await joinEndpoint(t, first.endpoint, person("Zach"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  const requests = Array.from({ length: 300 }, (_, index) => ({ id: `zach-${index}`, text: `message ${index}` }));
  const acknowledged = new Map<string, Message>();
  let killed: Promise<void> | undefined;

  // Send everything at once, and kill the server while most of it is still waiting.
  const sending = requests.map((request) =>
    zach.chat.post(main.id, request.text, request.id).then(
      (message) => {
        acknowledged.set(request.id, message);
        if (acknowledged.size === 20) killed = first.kill("SIGKILL");
      },
      () => undefined,
    ),
  );
  await Promise.all(sending);
  await killed;
  assert.ok(acknowledged.size >= 20);
  assert.ok(acknowledged.size < requests.length, "the kill came too late to interrupt anything");

  const second = await startChatChild(t, { dataDir });
  const again = await joinEndpoint(t, second.endpoint, person("Zach"));
  const stored = await readAll(again, main.id);
  for (const message of acknowledged.values()) {
    assert.deepEqual(stored.find((candidate) => candidate.id === message.id), message);
  }
  assert.deepEqual(
    stored.map((message) => message.seq),
    stored.map((_, index) => index + 1),
  );

  const retried = await Promise.all(
    requests.map((request) => again.chat.post(main.id, request.text, request.id)),
  );
  requests.forEach((request, index) => {
    const message = acknowledged.get(request.id);
    if (message !== undefined) assert.deepEqual(retried[index], message);
  });
  const final = await readAll(again, main.id);
  assert.equal(final.length, requests.length);
  assert.equal(new Set(final.map((message) => message.text)).size, requests.length);
});

test("a chat server in another process keeps this one out, and a killed one frees the data", { timeout }, async (t) => {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "chat-data");
  const child = await startChatChild(t, { dataDir });

  await assert.rejects(startChat({ dataDir }), StoreOwnedError);

  await child.kill("SIGKILL");
  const taken = await startChat({ dataDir });
  stopAfter(t, () => taken.close());
  assert.equal(taken.endpoint.serverId, child.endpoint.serverId);
  assert.equal(taken.endpoint.pid, process.pid);
});
