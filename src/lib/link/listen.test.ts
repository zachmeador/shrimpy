import assert from "node:assert/strict";
import { once } from "node:events";
import { test, type TestContext } from "node:test";
import { connect } from "node:tls";
import { WebSocket } from "ws";
import { stopAfter } from "../testing/index.ts";
import { newKey } from "../tls/node.ts";
import { listen, type ListenOptions } from "./node.ts";

/*
 * What a stranger's connection can make a listener hold at an address, where anyone can reach it: a hello far larger
 * than any is never read whole, and a connection that never says one is dropped.
 */

const timeout = 10_000;

/** A listener on a port of loopback, which notes every hello it reads and welcomes it. */
async function listening(t: TestContext, options: ListenOptions = {}) {
  const read: unknown[] = [];
  const listener = await listen(
    { host: "127.0.0.1", port: 0, key: newKey() },
    (hello) => {
      read.push(hello);
      return { answer: "welcome" };
    },
    options,
  );
  stopAfter(t, () => listener.close());
  const { port } = listener.place as { port: number };
  return { port, read };
}

/** A WebSocket to the listener on `port`, once it is open, with what it has been sent. */
async function webSocketTo(port: number) {
  const socket = new WebSocket(`wss://127.0.0.1:${String(port)}/`, { rejectUnauthorized: false });
  const answers: string[] = [];
  socket.on("message", (data: Buffer) => answers.push(data.toString()));
  socket.on("error", () => undefined);
  await once(socket, "open");
  return { socket, answers };
}

test("a first frame larger than any hello closes the connection before the listener reads it", { timeout }, async (t) => {
  const { port, read } = await listening(t);
  const { socket, answers } = await webSocketTo(port);

  socket.send(JSON.stringify({ hello: "x".repeat(1024 * 1024) }));
  await once(socket, "close");

  assert.deepEqual(read, []);
  assert.deepEqual(answers, []);
});

test("a connection whose hello never comes is dropped, whether or not it asked for a WebSocket", { timeout }, async (t) => {
  const { port, read } = await listening(t, { helloMs: 300 });
  const { socket } = await webSocketTo(port);
  // Through TLS, and then not a word.
  const silent = connect({ host: "127.0.0.1", port, rejectUnauthorized: false, minVersion: "TLSv1.3" });
  silent.on("error", () => undefined);
  await once(silent, "secureConnect");

  await Promise.all([once(socket, "close"), once(silent, "close")]);
  assert.deepEqual(read, []);
});
