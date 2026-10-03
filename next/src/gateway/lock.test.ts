import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { GatewayRunningError, takeGatewayLock } from "./lock.ts";
import { freshRuntime } from "./testing/index.ts";

test("one gateway holds a socket's lock at a time, and says which socket", (t) => {
  const socket = join(freshRuntime(t), "gateway.sock");
  const lock = takeGatewayLock(socket);

  assert.throws(
    () => takeGatewayLock(socket),
    (error) =>
      error instanceof GatewayRunningError &&
      error.socket === socket &&
      error.message.startsWith(`A gateway is already running on ${socket}. `) &&
      error.cause instanceof Error,
  );

  lock.release();
  takeGatewayLock(socket).release();
});

test("the lock is a file beside the socket", (t) => {
  const socket = join(freshRuntime(t), "gateway.sock");
  const lock = takeGatewayLock(socket);

  assert.ok(existsSync(`${socket}.lock`));
  lock.release();
});
