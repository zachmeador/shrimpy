import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { WebSocketServer } from "ws";
import { webSocketTransport } from "./web-socket.ts";

const timeout = 10_000;

/** A WebSocket server on a free loopback port. */
async function serve(options: ConstructorParameters<typeof WebSocketServer>[0] = {}) {
  const server = new WebSocketServer({ ...options, host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  return {
    server,
    url: `ws://127.0.0.1:${port}/`,
    async close() {
      for (const client of server.clients) client.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Open a transport and record what its handlers are told. */
async function open(url: string) {
  const chunks: Uint8Array[] = [];
  const waiting: ((chunk: Uint8Array) => void)[] = [];
  const errors: Error[] = [];
  let closes = 0;
  let onClosed = (): void => {};
  const closed = new Promise<void>((resolve) => {
    onClosed = resolve;
  });
  const transport = await webSocketTransport(url)({
    onData(chunk) {
      const waiter = waiting.shift();
      if (waiter) waiter(chunk);
      else chunks.push(chunk);
    },
    onClose() {
      closes += 1;
      onClosed();
    },
    onError: (error) => errors.push(error),
  });
  return {
    transport,
    errors,
    closed,
    closes: () => closes,
    next: () =>
      new Promise<Uint8Array>((resolve) => {
        const chunk = chunks.shift();
        if (chunk) resolve(chunk);
        else waiting.push(resolve);
      }),
  };
}

test("chunks travel as binary frames in both directions", { timeout }, async () => {
  const seen: { text: string; binary: boolean }[] = [];
  const target = await serve();
  target.server.on("connection", (socket) => {
    socket.on("message", (data, binary) => {
      seen.push({ text: Buffer.from(data as Buffer).toString(), binary });
      socket.send(Buffer.concat([Buffer.from("re:"), data as Buffer]));
    });
  });
  const client = await open(target.url);
  try {
    await client.transport.send(new TextEncoder().encode("hi"));
    assert.equal(new TextDecoder().decode(await client.next()), "re:hi");
    assert.deepEqual(seen, [{ text: "hi", binary: true }]);
  } finally {
    client.transport.close();
    await target.close();
  }
});

test("the server closing the socket reports one close and stops sending", { timeout }, async () => {
  const target = await serve();
  const client = await open(target.url);
  try {
    for (const socket of target.server.clients) socket.close();
    await client.closed;
    assert.equal(client.closes(), 1);
    assert.deepEqual(client.errors, []);
    await assert.rejects(client.transport.send(new Uint8Array([1])), /not open/);
  } finally {
    await target.close();
  }
});

test("closing the transport closes the socket, and closing again is harmless", { timeout }, async () => {
  const target = await serve();
  const serverSawClose = new Promise<void>((resolve) => {
    target.server.on("connection", (socket) => socket.on("close", () => resolve()));
  });
  const client = await open(target.url);
  try {
    client.transport.close();
    client.transport.close();
    await serverSawClose;
    await client.closed;
  } finally {
    await target.close();
  }
});

test("a connection that never opens rejects instead of reaching the handlers", { timeout }, async () => {
  const target = await serve();
  const url = target.url;
  await target.close();
  const events: string[] = [];
  await assert.rejects(
    async () =>
      webSocketTransport(url)({
        onData: () => events.push("data"),
        onClose: () => events.push("close"),
        onError: () => events.push("error"),
      }),
    /WebSocket/,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, []);
});

test("a refused handshake rejects", { timeout }, async () => {
  const target = await serve({ verifyClient: () => false });
  try {
    await assert.rejects(open(target.url), /WebSocket/);
  } finally {
    await target.close();
  }
});

test("a text frame is a protocol error and closes the socket", { timeout }, async () => {
  const target = await serve();
  target.server.on("connection", (socket) => socket.send("not bytes"));
  const client = await open(target.url);
  try {
    await client.closed;
    assert.equal(client.errors.length, 1);
    assert.match(client.errors[0]?.message ?? "", /text frame/);
  } finally {
    await target.close();
  }
});
