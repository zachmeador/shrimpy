import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember, personMember } from "../../contracts/chat/index.ts";
import { startStandInChat } from "../../contracts/chat/testing/index.ts";
import { startStandInGateway } from "../../contracts/gateway/testing/index.ts";
import { stopAfter, until, useRuntimeDir } from "../../lib/testing/index.ts";
import { openChatLocally } from "./index.ts";

const timeout = 15_000;
const neverStopped = new AbortController().signal;

test("chat is found through the gateway's list on this machine, and connected to", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);
  const stand = await startStandInChat(t, { register: true });
  await until(() => gateway.registered().length === 1, "chat to be listed");

  const connection = await openChatLocally(neverStopped);
  stopAfter(t, () => connection.close());

  await connection.chat.identify(personMember("zach"));
  const dm = await connection.chat.openDm(agentMember("scout"));
  assert.deepEqual(
    (await connection.chat.channels()).map((channel) => channel.id),
    [dm.id],
  );
  assert.equal(stand.connections(), 1);
});
