import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { WebSocketServer } from "ws";
import { settle } from "../../lib/testing/index.ts";
import { webSocketTransport } from "./web-socket.ts";

const timeout = 10_000;

test("a connection that never opens rejects instead of reaching the handlers", { timeout }, async () => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const events: string[] = [];

  await assert.rejects(
    async () =>
      webSocketTransport(`ws://127.0.0.1:${port}/`)({
        onData: () => events.push("data"),
        onClose: () => events.push("close"),
        onError: () => events.push("error"),
      }),
    /WebSocket/,
  );
  await settle();

  assert.deepEqual(events, []);
});
