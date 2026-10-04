import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { type Context, defineService, replicatedState, type ReplicatedState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { Server, SessionNotFoundError } from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import { openConnection } from "../connection/index.ts";
import { stopAfter, tempDir, until } from "../testing/index.ts";
import { isClientGone, offerToConnection } from "./index.ts";

interface Ticker {
  readonly state: ReplicatedState<{ text: string }>;
  ping(context: Context): Promise<void>;
}
const Ticker = defineService<Ticker>("shrimpy.test.ticker");

test("a client that leaves while the server is writing to it is not an error to report", { timeout: 30_000 }, async (t) => {
  const socket = join(tempDir(t, "gone"), "ticker.sock");
  const serverId = randomUUID();
  const state = replicatedState({ text: "" });
  const errors: Error[] = [];
  let connections = 0;
  const server = new Server(
    {
      serverServices: { attachClient: () => offerToConnection(Ticker, { state, ping: () => Promise.resolve() }) },
      resolveSession: () => Promise.reject(new SessionNotFoundError("This server has no routes.")),
      openSession: () => Promise.reject(new Error("This server has no routes.")),
    },
    {
      serverId,
      listeners: [createUnixListener({ path: socket })],
      onConnectionCountChanged: (count) => {
        connections = count;
      },
      onError: (error) => errors.push(error),
    },
  );
  await server.start();
  stopAfter(t, () => server.close());
  const client = await openConnection({ serverId, transportFactory: createUnixTransportFactory({ path: socket }), service: Ticker });
  client.service.state.subscribe(() => undefined);
  await until(() => connections === 1, "the client to be connected");

  // Far more than a socket takes at once, so most of it is still waiting to be written when the client leaves.
  const big = "x".repeat(300_000);
  for (let update = 0; update < 60; update++) state.replace(BACKGROUND_CONTEXT, { text: `${big}${update}` });
  await client.close({ goodbye: false });
  await until(() => connections === 0, "the server to let go of the client");
  await delay(100);

  assert.ok(errors.length > 0, "writing to a client that left fails");
  assert.deepEqual(errors.filter((error) => !isClientGone(error)).map((error) => error.message), []);
});
