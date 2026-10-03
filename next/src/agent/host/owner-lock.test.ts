import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { HomeOwnedError, takeOwnerLock } from "./owner-lock.ts";

const lockModule = new URL("./owner-lock.ts", import.meta.url).href;

function holdLockInChild(home: string) {
  const script = `
    import { takeOwnerLock } from ${JSON.stringify(lockModule)};
    // Held in a global: a lock nothing refers to is closed when it is collected.
    globalThis.lock = takeOwnerLock(${JSON.stringify(home)});
    console.log("locked");
    setInterval(() => {}, 1000);
  `;
  return spawn(process.execPath, ["--input-type=module", "-e", script], {
    stdio: ["ignore", "pipe", "inherit"],
  });
}

test("a home has one owner at a time, and a killed owner frees it", async () => {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-lock-"));
  const child = holdLockInChild(home);
  try {
    await once(child.stdout, "data");
    assert.throws(() => takeOwnerLock(home), HomeOwnedError);
  } finally {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
  takeOwnerLock(home).release();
});

test("a released lock can be taken again", () => {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-lock-"));
  takeOwnerLock(home).release();
  takeOwnerLock(home).release();
});
