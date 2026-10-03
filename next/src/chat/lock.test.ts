import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { useRuntimeDir } from "../lib/testing/index.ts";
import { ChatRunningError, takeChatLock } from "./lock.ts";

test("one chat server holds a socket's lock at a time, and says which socket", (t) => {
  const socket = join(useRuntimeDir(t), "chat.sock");
  const lock = takeChatLock(socket);

  assert.throws(
    () => takeChatLock(socket),
    (error) =>
      error instanceof ChatRunningError &&
      error.socket === socket &&
      error.message.startsWith(`A chat server is already running on ${socket}. `) &&
      error.cause instanceof Error,
  );

  lock.release();
  takeChatLock(socket).release();
});

test("the lock is a file beside the socket", (t) => {
  const socket = join(useRuntimeDir(t), "chat.sock");
  const lock = takeChatLock(socket);

  assert.ok(existsSync(`${socket}.lock`));
  lock.release();
});
