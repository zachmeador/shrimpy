import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { GatewayRunningError, takeGatewayLock } from "./lock.ts";
import { freshRuntime } from "./testing/index.ts";

test("one gateway holds a socket's lock at a time, and releasing frees it", (t) => {
  const socket = join(freshRuntime(t), "gateway.sock");
  const lock = takeGatewayLock(socket);

  assert.throws(
    () => takeGatewayLock(socket),
    (error) => error instanceof GatewayRunningError && error.socket === socket,
  );

  lock.release();
  takeGatewayLock(socket).release();
});

test("different sockets have different locks", (t) => {
  const runtime = freshRuntime(t);
  const first = takeGatewayLock(join(runtime, "one.sock"));
  const second = takeGatewayLock(join(runtime, "two.sock"));
  first.release();
  second.release();
});
