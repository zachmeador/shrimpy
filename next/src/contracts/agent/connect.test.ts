import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { type Context, defineService, RemoteServiceError } from "@earendil-works/chord";
import { type AttachmentChangeListener, Client } from "@earendil-works/pi-client";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import {
  offer,
  settle,
  startStandIn,
  stopAfter,
  until,
  useRuntimeDir,
} from "../../lib/testing/index.ts";
import { AgentConnectionLostError, type AgentConnection, connectAgent } from "./index.ts";
import { SessionDirectory } from "./services.ts";

const timeout = 15_000;

/** An agent that lists one session and does whatever `attach` says when a client asks to watch it. */
async function standInAgent(t: TestContext, attach: (sessionId: string) => Promise<void>) {
  useRuntimeDir(t);
  return startStandIn(t, "agent", {
    offer: () =>
      offer(SessionDirectory, {
        list: () => Promise.resolve([{ id: "1", main: true }]),
        attach: (sessionId) => attach(sessionId),
        detach: () => Promise.resolve(),
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

  const attaching = assert.rejects(connection.attach("1"), AgentConnectionLostError);
  await accepted;
  await settle();
  await standIn.close();

  await attaching;
});

test("an attach the server refuses leaves nothing listening for its route", { timeout }, async (t) => {
  const listening = new Set<AttachmentChangeListener>();
  type Listen = (this: Client, listener: AttachmentChangeListener) => () => void;
  const original = Reflect.get(Client.prototype, "onAttachmentChange") as Listen;
  t.mock.method(Client.prototype, "onAttachmentChange", function (this: Client, listener: AttachmentChangeListener) {
    const stop = original.call(this, listener);
    listening.add(listener);
    return () => {
      listening.delete(listener);
      stop();
    };
  });
  const standIn = await standInAgent(t, () =>
    Promise.reject(new RemoteServiceError("service_invalid_value", "Unknown session: 999")),
  );
  const connection = await connect(t, standIn);

  await assert.rejects(connection.attach("999"), /Unknown session: 999/);

  assert.equal(listening.size, 0);
});

test("a program that does not offer the agent API is refused, and the connection is closed", { timeout }, async (t) => {
  useRuntimeDir(t);
  interface Other {
    ping(context: Context): Promise<void>;
  }
  const Other = defineService<Other>("shrimpy.test.other");
  const standIn = await startStandIn(t, "other", { offer: () => offer(Other, { ping: () => Promise.resolve() }) });

  await assert.rejects(
    connectAgent({
      serverId: standIn.serverId,
      transportFactory: createUnixTransportFactory({ path: standIn.socket }),
    }),
  );

  await until(() => standIn.connections() === 0, "the refused connection to close");
});
