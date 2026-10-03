import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { connect, createServer, type Socket } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { WebSocket as WsClient } from "ws";
import { webSocketPath, webSocketTransport } from "../../contracts/gateway/index.ts";
import { namedSocketPath } from "../../lib/runtime/index.ts";
import {
  connectEcho,
  eventually,
  freshRuntime,
  handshakeStatus,
  startEchoProgram,
} from "../testing/index.ts";
import { startWeb } from "./index.ts";

const timeout = 30_000;

/** A browser entry that pipes `agent/<name>` to the socket given for `name`. */
function openEntry(programs: Record<string, string>) {
  return startWeb({ port: 0 }, (target) =>
    target === "gateway" || target.kind !== "agent" ? undefined : programs[target.name],
  );
}

const agentUrl = (port: number, name: string): string =>
  `ws://127.0.0.1:${port}${webSocketPath({ kind: "agent", name })}`;

interface BytesTarget {
  readonly socket: string;
  /** Every connection it has accepted, oldest first. */
  readonly connections: Socket[];
  /** How many of them are still open. */
  open(): number;
  /** Everything the connections have sent it. */
  received(): Buffer;
  close(): Promise<void>;
}

/** A plain Unix socket server, to see exactly which bytes the pipe passes and when it closes. */
async function startBytesTarget(name: string): Promise<BytesTarget> {
  const socket = namedSocketPath(name);
  const connections: Socket[] = [];
  const chunks: Buffer[] = [];
  let open = 0;
  const server = createServer((connection) => {
    connections.push(connection);
    open += 1;
    connection.on("data", (chunk: Buffer) => chunks.push(chunk));
    connection.on("error", () => undefined);
    connection.once("close", () => {
      open -= 1;
    });
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  return {
    socket,
    connections,
    open: () => open,
    received: () => Buffer.concat(chunks),
    async close() {
      for (const connection of connections) connection.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function reaches(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = connect({ host, port });
    probe.once("connect", () => {
      probe.destroy();
      resolve(true);
    });
    probe.once("error", () => resolve(false));
  });
}

test("a client reaches a program through the pipe and makes a call", { timeout }, async (t) => {
  freshRuntime(t);
  const echo = await startEchoProgram("echo-agent");
  const entry = await openEntry({ echo: echo.socket });
  const url = agentUrl(entry.port, "echo");
  const first = await connectEcho(echo.serverId, webSocketTransport(url));
  const second = await connectEcho(echo.serverId, webSocketTransport(url));
  try {
    assert.equal(await first.echo("hello"), "echo: hello");
    assert.equal(await second.echo("there"), "echo: there");
    assert.equal(echo.connections(), 2);
  } finally {
    await first.close();
    await second.close();
    await entry.close();
    await echo.close();
  }
});

test("bytes pass through unchanged in both directions, however they are split", { timeout }, async (t) => {
  freshRuntime(t);
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

test("when the client closes, however it does it, the program's connection closes", { timeout }, async (t) => {
  freshRuntime(t);
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
  freshRuntime(t);
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

test("a target that is not running is refused, and nothing is connected", { timeout }, async (t) => {
  const runtime = freshRuntime(t);
  const target = await startBytesTarget("known");
  const entry = await openEntry({ known: target.socket, ghost: join(runtime, "ghost.sock") });
  try {
    const unknown = [
      "/ws/agent/nobody",
      "/ws/chat/known",
      "/ws/gateway",
      "/ws/robot/known",
      "/ws/agent/known/extra",
      "/ws/agent/",
      "/ws/agent/%E0%A4%A",
      "/ws",
      "/",
    ];
    for (const path of unknown) assert.equal(await handshakeStatus(entry.port, path), 404, path);
    assert.equal(await handshakeStatus(entry.port, "/ws/agent/ghost"), 502);
    assert.equal(target.connections.length, 0);

    assert.equal(await handshakeStatus(entry.port, "/ws/agent/known"), 101);
  } finally {
    await entry.close();
    await target.close();
  }
});

test("a page from another origin is refused, and nothing is connected", { timeout }, async (t) => {
  freshRuntime(t);
  const target = await startBytesTarget("known");
  const entry = await openEntry({ known: target.socket });
  try {
    const { port } = entry;
    const foreign = [
      "https://evil.example",
      "http://evil.example:80",
      `http://127.0.0.1:${port + 1}`,
      `http://localhost:${port + 1}`,
      `https://127.0.0.1:${port}`,
      "http://localhost",
      "null",
      "",
    ];
    for (const origin of foreign) {
      assert.equal(await handshakeStatus(port, "/ws/agent/known", { Origin: origin }), 403, origin);
    }
    assert.equal(target.connections.length, 0);

    for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`]) {
      assert.equal(await handshakeStatus(port, "/ws/agent/known", { Origin: origin }), 101, origin);
    }
  } finally {
    await entry.close();
    await target.close();
  }
});

test("a client that sends no Origin is not a web page, and is accepted", { timeout }, async (t) => {
  freshRuntime(t);
  const target = await startBytesTarget("known");
  const entry = await openEntry({ known: target.socket });
  try {
    assert.equal(await handshakeStatus(entry.port, "/ws/agent/known"), 101);
  } finally {
    await entry.close();
    await target.close();
  }
});

test("a handshake that fails leaves no connection to the program", { timeout }, async (t) => {
  freshRuntime(t);
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
  freshRuntime(t);
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

test("a refused client that never hangs up cannot keep the entry from closing", { timeout }, async (t) => {
  freshRuntime(t);
  const entry = await openEntry({});
  const client = connect({ host: "127.0.0.1", port: entry.port });
  client.on("error", () => undefined);
  try {
    await once(client, "connect");
    client.write(
      [
        "GET /ws/agent/nobody HTTP/1.1",
        "Host: 127.0.0.1",
        "Connection: Upgrade",
        "Upgrade: websocket",
        "Sec-WebSocket-Version: 13",
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==",
        "",
        "",
      ].join("\r\n"),
    );
    const [answer] = (await once(client, "data")) as [Buffer];
    assert.match(answer.toString(), /^HTTP\/1\.1 404 /);

    await entry.close();
  } finally {
    client.destroy();
  }
});

test("a message larger than a protocol frame closes the pipe", { timeout }, async (t) => {
  freshRuntime(t);
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

test("it listens on loopback only", { timeout }, async (t) => {
  freshRuntime(t);
  const entry = await openEntry({});
  try {
    assert.ok(await reaches("127.0.0.1", entry.port));
    const external = Object.values(networkInterfaces())
      .flat()
      .find((address) => address?.family === "IPv4" && !address.internal);
    if (external === undefined) {
      t.diagnostic("no address beyond loopback on this machine, so nothing to refuse");
      return;
    }
    assert.equal(await reaches(external.address, entry.port), false);
  } finally {
    await entry.close();
  }
});

test("closing the entry closes every open pipe and frees the port", { timeout }, async (t) => {
  freshRuntime(t);
  const echo = await startEchoProgram("echo-agent");
  const entry = await openEntry({ echo: echo.socket });
  const client = await connectEcho(echo.serverId, webSocketTransport(agentUrl(entry.port, "echo")));
  try {
    assert.equal(await client.echo("still here"), "echo: still here");
    const ended = new Promise<void>((resolve) => client.onDisconnect(resolve));

    await entry.close();

    await ended;
    await eventually(() => echo.connections(), (count) => count === 0);
    assert.equal(await reaches("127.0.0.1", entry.port), false);
    await entry.close();
  } finally {
    await client.close();
    await echo.close();
  }
});
