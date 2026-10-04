import assert from "node:assert/strict";
import { test } from "node:test";
import type { ByteTransportFactory, ByteTransportHandlers } from "@earendil-works/pi-client";
import { freezable } from "./frozen.ts";

/** A transport that hands its handlers to the test, which plays the server by calling them. */
function inner() {
  const connected: ByteTransportHandlers[] = [];
  const transportFactory: ByteTransportFactory = (handlers) => {
    connected.push(handlers);
    return { send: () => Promise.resolve(), close: () => undefined };
  };
  return { transportFactory, connected };
}

test("what the server sends gets through until the server is frozen, and not after", async () => {
  const { transportFactory, connected } = inner();
  const server = freezable(transportFactory);
  const received: number[] = [];

  await server.transportFactory({
    onData: (chunk) => received.push(chunk.length),
    onClose: () => undefined,
    onError: () => undefined,
  });
  connected[0]?.onData(new Uint8Array(3));
  server.freeze();
  connected[0]?.onData(new Uint8Array(5));

  assert.deepEqual(received, [3]);
});

test("a connection made after the freeze hears nothing from its first byte", async () => {
  const { transportFactory, connected } = inner();
  const server = freezable(transportFactory);
  const received: number[] = [];
  server.freeze();

  await server.transportFactory({
    onData: (chunk) => received.push(chunk.length),
    onClose: () => undefined,
    onError: () => undefined,
  });
  connected[0]?.onData(new Uint8Array(3));

  assert.deepEqual(received, []);
});

test("the end of a connection still gets through, so only silence is simulated", async () => {
  const { transportFactory, connected } = inner();
  const server = freezable(transportFactory);
  let closed = 0;
  await server.transportFactory({ onData: () => undefined, onClose: () => (closed += 1), onError: () => undefined });

  server.freeze();
  connected[0]?.onClose();

  assert.equal(closed, 1);
});
