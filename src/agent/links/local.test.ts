import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember, personMember } from "../../contracts/chat/index.ts";
import { scriptedChat, startStandInChat } from "../../contracts/chat/testing/index.ts";
import type { GatewayConnection, Registration } from "../../contracts/gateway/index.ts";
import { startStandInGateway } from "../../contracts/gateway/testing/index.ts";
import { stopAfter, until, useRuntimeDir } from "../../lib/testing/index.ts";
import { ChatUnavailableError, findChat, openChatLocally } from "./index.ts";

const timeout = 15_000;
const neverStopped = new AbortController().signal;
const scout = agentMember("scout");

test("chat is found through the gateway's list on this machine, and connected to", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const stand = await startStandInChat(t, { register: true });
  await until(() => gateway.registered().length === 1, "chat to be listed");

  const connection = await openChatLocally(neverStopped);
  stopAfter(t, () => connection.close());

  await connection.chat.identify(personMember("zach"));
  const dm = await connection.chat.openDm(scout);
  assert.deepEqual(
    (await connection.chat.channels()).map((channel) => channel.id),
    [dm.id],
  );
  assert.equal(stand.connections(), 1);
});

test("with no gateway running, chat is unavailable, and the reason says so", { timeout }, async (t) => {
  useRuntimeDir(t);

  await assert.rejects(openChatLocally(neverStopped), (error: unknown) => {
    assert.ok(error instanceof ChatUnavailableError);
    assert.match(error.message, /No gateway is running/);
    return true;
  });
});

test("a gateway that lists no chat server leaves chat unavailable", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startStandInGateway(t);

  await assert.rejects(openChatLocally(neverStopped), new ChatUnavailableError("The gateway lists no chat server."));
});

test("a chat server that is listed but gone leaves chat unavailable", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const stand = await startStandInChat(t, { register: true });
  await until(() => gateway.registered().length === 1, "chat to be listed");
  await stand.outage();

  await assert.rejects(openChatLocally(neverStopped), (error: unknown) => {
    assert.ok(error instanceof ChatUnavailableError);
    assert.match(error.message, /is not answering on /);
    return true;
  });
});

test("each hop to chat can be made some other way, so nothing needs the gateway or chat on this machine", { timeout }, async () => {
  const chat = scriptedChat();
  const reached: string[] = [];
  const far: Registration = {
    kind: "chat",
    name: "chat",
    serverId: "far-away",
    socket: "tcp://chat.example:7000",
    pid: 1,
    version: "0.0.0",
  };
  const gateway = {
    list: () => Promise.resolve([far]),
    close() {
      reached.push("gateway closed");
      return Promise.resolve();
    },
  } as unknown as GatewayConnection;
  const open = findChat({
    gateway() {
      reached.push("gateway");
      return Promise.resolve(gateway);
    },
    chat(registered) {
      reached.push(registered.socket);
      return chat.connect();
    },
  });

  const connection = await open(neverStopped);
  await connection.chat.identify(scout);

  assert.deepEqual(reached, ["gateway", "gateway closed", "tcp://chat.example:7000"]);
});
