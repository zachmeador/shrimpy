import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { connect, type Socket } from "node:net";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket as WsClient } from "ws";
import { eventually, useRuntimeDir } from "../../lib/testing/index.ts";
import { agentUrl, handshakeStatus, openEntry, startBytesTarget } from "../testing/index.ts";

const timeout = 30_000;

test("bytes pass through unchanged in both directions, however they are split", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await startBytesTarget("bytes");
  const entry = await openEntry({ bytes: target.socket });
  const client = new WsClient(agentUrl(entry.port, "bytes"));
  try {
    await once(client, "open");
    await eventually(() => target.connections.length, (count) => count === 1);

    const outgoing = randomBytes(3 * 1024 * 1024);
    for (let offset = 0; offset < outgoing.length; offset += 200_000) {
      client.send(outgoing.subarray(offset, offset + 200_000));
    }
    await eventually(() => target.received().length, (length) => length === outgoing.length);
    assert.ok(target.received().equals(outgoing));

    const incoming = randomBytes(3 * 1024 * 1024);
    const frames: { bytes: Buffer; binary: boolean }[] = [];
    client.on("message", (data, binary) => frames.push({ bytes: Buffer.from(data as Buffer), binary }));
    target.connections[0]?.write(incoming);
    await eventually(
      () => frames.reduce((sum, frame) => sum + frame.bytes.length, 0),
      (length) => length === incoming.length,
    );
    assert.ok(Buffer.concat(frames.map((frame) => frame.bytes)).equals(incoming));
    assert.ok(frames.every((frame) => frame.binary));
  } finally {
    client.terminate();
    await entry.close();
    await target.close();
  }
});

/** Write to `connection` until it stops taking data for a moment, and say how much it took. */
async function fillUntilStalled(connection: Socket, limit: number): Promise<number> {
  const chunk = Buffer.alloc(64 * 1024, 7);
  let written = 0;
  while (written < limit) {
    written += chunk.length;
    if (connection.write(chunk)) continue;
    const drained = await Promise.race([
      once(connection, "drain").then(() => true),
      delay(300).then(() => false),
    ]);
    if (!drained) break;
  }
  return written;
}

test("a client that stops reading slows the program instead of filling the gateway", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await startBytesTarget("flood");
  const entry = await openEntry({ flood: target.socket });
  const client = new WsClient(agentUrl(entry.port, "flood"));
  try {
    await once(client, "open");
    await eventually(() => target.connections.length, (count) => count === 1);
    let received = 0;
    client.on("message", (data) => {
      received += (data as Buffer).length;
    });
    client.pause();

    const connection = target.connections[0];
    assert.ok(connection);
    const limit = 128 * 1024 * 1024;
    const written = await fillUntilStalled(connection, limit);

    // Kernel buffers and a few stream buffers hold some, but nowhere near all of it.
    assert.ok(written < limit / 4, `${written} bytes went in before the pipe pushed back`);

    client.resume();
    await eventually(() => received, (bytes) => bytes === written);
  } finally {
    client.terminate();
    await entry.close();
    await target.close();
  }
});

test("when the client closes, however it does it, the program's connection closes", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await startBytesTarget("closing");
  const entry = await openEntry({ closing: target.socket });
  try {
    for (const how of ["close", "terminate"] as const) {
      const client = new WsClient(agentUrl(entry.port, "closing"));
      await once(client, "open");
      await eventually(() => target.open(), (open) => open === 1);

      client[how]();

      await eventually(() => target.open(), (open) => open === 0);
    }
  } finally {
    await entry.close();
    await target.close();
  }
});

test("when the program closes, however it does it, the client closes", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await startBytesTarget("closing");
  const entry = await openEntry({ closing: target.socket });
  try {
    for (const how of ["end", "destroy"] as const) {
      const client = new WsClient(agentUrl(entry.port, "closing"));
      const received: string[] = [];
      client.on("message", (data) => received.push(Buffer.from(data as Buffer).toString()));
      await once(client, "open");
      await eventually(() => target.open(), (open) => open === 1);

      const connection = target.connections.at(-1);
      if (how === "end") connection?.end("last words");
      else connection?.destroy();

      await once(client, "close");
      // What was sent before the close arrives before it.
      assert.equal(received.join(""), how === "end" ? "last words" : "");
    }
  } finally {
    await entry.close();
    await target.close();
  }
});

test("a handshake that fails leaves no connection to the program", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await startBytesTarget("known");
  const entry = await openEntry({ known: target.socket });
  try {
    // The program is reached before the WebSocket library looks at the handshake, so this one gets as far as the program.
    const status = await handshakeStatus(entry.port, "/ws/agent/known", {
      "Sec-WebSocket-Version": "7",
    });
    assert.equal(status, 400);

    await eventually(() => target.connections.length, (count) => count === 1);
    await eventually(() => target.open(), (open) => open === 0);
  } finally {
    await entry.close();
    await target.close();
  }
});

test("clients that reset the connection mid-handshake do not take the entry down", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await startBytesTarget("known");
  const entry = await openEntry({ known: target.socket });
  try {
    const handshake = [
      "GET /ws/agent/known HTTP/1.1",
      "Host: 127.0.0.1",
      "Connection: Upgrade",
      "Upgrade: websocket",
      "Sec-WebSocket-Version: 13",
      "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
      "",
      "",
    ].join("\r\n");
    await Promise.all(
      Array.from({ length: 100 }, async () => {
        const client = connect({ host: "127.0.0.1", port: entry.port });
        client.on("error", () => undefined);
        await once(client, "connect");
        client.write(handshake);
        client.resetAndDestroy();
      }),
    );

    await eventually(() => target.open(), (open) => open === 0);
    assert.equal(await handshakeStatus(entry.port, "/ws/agent/known"), 101);
  } finally {
    await entry.close();
    await target.close();
  }
});

test("a message larger than a protocol frame closes the pipe", { timeout }, async (t) => {
  useRuntimeDir(t);
  const target = await startBytesTarget("known");
  const entry = await openEntry({ known: target.socket });
  const client = new WsClient(agentUrl(entry.port, "known"));
  try {
    await once(client, "open");
    await eventually(() => target.open(), (open) => open === 1);

    client.send(Buffer.alloc(17 * 1024 * 1024));

    const [code] = (await once(client, "close")) as [number];
    assert.equal(code, 1009);
    await eventually(() => target.open(), (open) => open === 0);
  } finally {
    client.terminate();
    await entry.close();
    await target.close();
  }
});
