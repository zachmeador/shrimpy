import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { connectToSocket } from "../contracts/chat/testing/index.ts";
import { countedBackoff, eventually, inRuntimeDir, stopAfter, tempDir, until, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { ChatRunningError, startChat } from "./index.ts";
import { StoreOwnedError } from "./store/index.ts";
import { mainThread, startTestChat } from "./testing/index.ts";

const timeout = 30_000;

/** What the gateway lists as programs, asked over a connection of its own. */
async function registered(chat: Awaited<ReturnType<typeof startTestChat>>) {
  const observer = await chat.gateway.connect();
  try {
    return await observer.list();
  } finally {
    await observer.close();
  }
}

test("the chat server registers with the gateway and tells it which version it runs, and closing it ends that", { timeout }, async (t) => {
  const chat = await startTestChat(t);

  await eventually(() => registered(chat), (programs) => programs.length === 1, { what: "the chat server to register" });

  assert.deepEqual(await registered(chat), [{ kind: "chat", name: "chat", memberId: null, version: SHRIMPY_VERSION }]);
  await chat.chat.close();
  await eventually(() => registered(chat), (programs) => programs.length === 0, { what: "the registration to end" });
});

test("with no gateway running, the chat server starts, serves and closes quietly, and refuses to let anyone in, saying why", { timeout }, async (t) => {
  useRuntimeDir(t);
  const reported = t.mock.method(console, "error", () => undefined);
  const pauses = countedBackoff();
  const chat = await startChat({ dataDir: tempDir(t, "chat-data"), backoff: pauses });
  const stranger = await connectToSocket(chat);
  stopAfter(t, () => stranger.close());

  await assert.rejects(stranger.chat.enter("a-ticket"), {
    code: "service_not_allowed",
    message: /can't reach the gateway right now/,
  });
  await until(() => pauses.taken() >= 2, "the chat server to have looked for the gateway more than once");
  await chat.close();

  assert.equal(reported.mock.callCount(), 0);
});

test("while the gateway is away the chat server refuses to let anyone in and says why, and keeps what was said, and lets people in again when the gateway is back", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const shrimpy = await chat.agent("Shrimpy");
  const dm = await zach.chat.openDm(shrimpy.me.id);
  const main = await mainThread(zach, dm.id);
  const before = await zach.chat.post(main.id, "The gateway is still here.", "zach-1");
  // A ticket made while the gateway is there; whether it is any good is the gateway's to say.
  const ticket = await chat.ticket();
  // Straight to the chat server, since the way in the gateway makes goes with it.
  const late = await chat.connect();

  await chat.gateway.outage();
  await assert.rejects(late.chat.enter(ticket), { message: /can't reach the gateway right now/ });
  await chat.gateway.recover();

  const again = await chat.agent("Shrimpy");
  assert.equal(again.me.id, shrimpy.me.id, "the agent is the same member");
  assert.deepEqual(await again.chat.read(main.id, null, 10), [before]);
});

test("a chat server that is refused never registers", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  await eventually(() => registered(chat), (programs) => programs.length === 1, { what: "the chat server to register" });

  await assert.rejects(startChat({ dataDir: chat.dataDir }), ChatRunningError);
  await assert.rejects(startChat({ dataDir: tempDir(t, "chat-other") }), ChatRunningError);
  await assert.rejects(
    inRuntimeDir(tempDir(t, "rt-other"), () => startChat({ dataDir: chat.dataDir })),
    StoreOwnedError,
  );
  await delay(100);

  assert.equal((await registered(chat)).length, 1);
});
