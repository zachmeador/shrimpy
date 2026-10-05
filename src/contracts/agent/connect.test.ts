import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { offer, startStandIn, stopAfter, useRuntimeDir } from "../../lib/testing/index.ts";
import { AgentConnectionLostError, type AgentConnection, connectAgent } from "./index.ts";
import { SessionDirectory } from "./services.ts";

const timeout = 15_000;

/** An agent that lists one session and does whatever `attach` says when a client asks to watch it. */
async function standInAgent(t: TestContext, attach: (threadId: string) => Promise<void>) {
  useRuntimeDir(t);
  return startStandIn(t, "agent", {
    offer: () =>
      offer(SessionDirectory, {
        enter: () => Promise.resolve({ id: "mem_you", kind: "person", name: "you" }),
        list: () => Promise.resolve([{ id: "th_1", threadId: "th_1", channelId: "ch_1", working: false }]),
        attach: (threadId) => attach(threadId),
        detach: () => Promise.resolve(),
        triggers: () => Promise.resolve([]),
        trigger: () => Promise.reject(new Error("No triggers here.")),
        fire: () => Promise.reject(new Error("No triggers here.")),
        reload: () => Promise.resolve({ soul: false, files: 0, skills: 0, triggers: 0, leftOut: [] }),
      }),
  });
}

async function connect(t: TestContext, standIn: { serverId: string; socket: string }): Promise<AgentConnection> {
  const connection = await connectAgent({
    serverId: standIn.serverId,
    transportFactory: createUnixTransportFactory({ path: standIn.socket }),
  });
  stopAfter(t, () => connection.close());
  return connection;
}

test("an attach that is waiting for its route fails when the connection drops", { timeout }, async (t) => {
  let accept = (): void => {};
  const accepted = new Promise<void>((resolve) => {
    accept = resolve;
  });
  // The server accepts the attach and never announces the route.
  const standIn = await standInAgent(t, () => {
    accept();
    return Promise.resolve();
  });
  const connection = await connect(t, standIn);

  const attaching = assert.rejects(connection.attach("th_1"), AgentConnectionLostError);
  await accepted;
  // The server had answered the attach before it read this call, so once this is answered the attach is waiting for its route.
  await connection.sessions();
  await standIn.close();

  await attaching;
});
