import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { connectLocal } from "../contracts/chat/node.ts";
import { eventually, inRuntimeDir, stopAfter, tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { ChatRunningError, startChat } from "./index.ts";
import { StoreOwnedError } from "./store/index.ts";
import { mainThread, startTestChat, texts } from "./testing/index.ts";

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

test("the chat server tells the gateway where it is and which version it runs, and closing it ends that", { timeout }, async (t) => {
  const chat = await startTestChat(t);

  await eventually(() => registered(chat), (programs) => programs.length === 1, { what: "the chat server to register" });

  const { serverId, socket, pid } = chat.chat.endpoint;
  assert.deepEqual(await registered(chat), [
    { kind: "chat", name: "chat", memberId: null, serverId, socket, pid, version: SHRIMPY_VERSION },
  ]);
  await chat.chat.close();
  await eventually(() => registered(chat), (programs) => programs.length === 0, { what: "the registration to end" });
});

test("with no gateway running, the chat server starts, serves and closes quietly, and refuses to let anyone in, saying why", { timeout }, async (t) => {
  useRuntimeDir(t);
  const reported = t.mock.method(console, "error", () => undefined);
  const chat = await startChat({ dataDir: tempDir(t, "chat-data") });
  const stranger = await connectLocal(chat.endpoint);
  stopAfter(t, () => stranger.close());

  await assert.rejects(stranger.chat.enter("a-ticket"), {
    code: "service_not_allowed",
    message: /can't reach the gateway right now/,
  });
  // Long enough for it to have looked for the gateway more than once.
  await delay(300);
  await chat.close();

  assert.equal(reported.mock.callCount(), 0);
});

test("while the gateway is away the chat server refuses to let anyone in and keeps serving those who are in, and lets people in again when the gateway is back", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const shrimpy = await chat.agent("Shrimpy");
  const dm = await zach.chat.openDm(shrimpy.me.id);
  const main = await mainThread(zach, dm.id);
  // A ticket made while the gateway is there; whether it is any good is the gateway's to say.
  const ticket = await chat.ticket();
  const late = await chat.connect();

  await chat.gateway.outage();
  await assert.rejects(late.chat.enter(ticket), { message: /can't reach the gateway right now/ });
  const whileAway = await zach.chat.post(main.id, "The gateway is gone.", "zach-1");
  assert.deepEqual(texts(await shrimpy.chat.read(main.id, null, 10)), ["The gateway is gone."]);
  await chat.gateway.recover();

  const again = await chat.agent("Shrimpy");
  assert.equal(again.me.id, shrimpy.me.id, "the agent is the same member");
  assert.deepEqual(await again.chat.read(main.id, null, 10), [whileAway]);
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
