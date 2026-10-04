import assert from "node:assert/strict";
import { once } from "node:events";
import { connect, createServer, type Socket } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { stopAfter, tempDir } from "../testing/index.ts";
import { isClientGone } from "./index.ts";

test("the error from writing to a client that has gone says only that", async (t) => {
  const server = createServer();
  stopAfter(t, () => new Promise<void>((resolve) => server.close(() => resolve())));
  const path = join(tempDir(t, "gone"), "server.sock");
  server.listen(path);
  await once(server, "listening");
  const client = connect(path);
  const [[serverSide]] = (await Promise.all([once(server, "connection"), once(client, "connect")])) as [[Socket], unknown];
  stopAfter(t, () => void serverSide.destroy());

  // The client is gone at once, and the server writes before it has heard.
  client.destroy();
  const failed = once(serverSide, "error") as Promise<[Error]>;
  serverSide.write("still there?");
  const [error] = await failed;

  assert.equal(error.message, "write EPIPE");
  assert.equal(isClientGone(error), true);
});

test("a client that left without reading what it was sent is gone too", () => {
  assert.equal(isClientGone(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" })), true);
});

test("any other error says something more", () => {
  assert.equal(isClientGone(new Error("write EPIPE")), false);
  assert.equal(isClientGone(Object.assign(new Error("listen EADDRINUSE"), { code: "EADDRINUSE" })), false);
  assert.equal(isClientGone("EPIPE"), false);
  assert.equal(isClientGone(undefined), false);
  assert.equal(isClientGone(null), false);
});
