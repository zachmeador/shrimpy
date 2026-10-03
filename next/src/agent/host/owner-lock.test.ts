import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { HomeOwnedError, takeOwnerLock } from "./owner-lock.ts";

function tempHome(t: TestContext): string {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-lock-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

test("a home has one owner at a time, and says which home it is", (t) => {
  const home = tempHome(t);
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
  const home = tempHome(t);
  const lock = takeOwnerLock(home);

  assert.ok(existsSync(join(home, "runtime", "owner.lock")));
  lock.release();
});
