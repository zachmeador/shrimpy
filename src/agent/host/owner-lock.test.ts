import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tempDir } from "../../lib/testing/index.ts";
import { HomeOwnedError, takeOwnerLock } from "./owner-lock.ts";

test("a home has one owner at a time, and says which home it is", (t) => {
  const home = tempDir(t, "lock");
  const lock = takeOwnerLock(home);

  assert.throws(
    () => takeOwnerLock(home),
    (error) =>
      error instanceof HomeOwnedError &&
      error.message.startsWith(`Another process owns the agent home at ${home}. `) &&
      error.cause instanceof Error,
  );

  lock.release();
  takeOwnerLock(home).release();
});

test("the lock lives in the home's runtime folder, which it creates", (t) => {
  const home = tempDir(t, "lock");
  const lock = takeOwnerLock(home);

  assert.ok(existsSync(join(home, "runtime", "owner.lock")));
  lock.release();
});
