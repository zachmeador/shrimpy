import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { isLocked, takeLock } from "./index.ts";

const lockModule = new URL("./index.ts", import.meta.url).href;

class Taken extends Error {}
const taken = (cause: Error): Error => new Taken("taken", { cause });

function lockFile(t: TestContext, name = "x.lock"): string {
  const directory = mkdtempSync(join(tmpdir(), "shrimpy-lock-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, name);
}

test("one process holds a lock at a time, and releasing frees it", (t) => {
  const file = lockFile(t);
  const lock = takeLock(file, taken);

  assert.throws(
    () => takeLock(file, taken),
    (error) => error instanceof Taken && error.cause instanceof Error && /locked/.test(error.cause.message),
  );

  lock.release();
  takeLock(file, taken).release();
});

test("isLocked recognizes a busy database and nothing else", (t) => {
  const file = lockFile(t);
  const lock = takeLock(file, taken);
  const busy = (() => {
    try {
      takeLock(file, (cause) => cause);
    } catch (error) {
      return error;
    }
  })();
  lock.release();

  assert.equal(isLocked(busy), true);
  assert.equal(isLocked(new Error("database is locked")), false);
  assert.equal(isLocked("database is locked"), false);
  assert.equal(isLocked(undefined), false);
});

test("releasing twice does nothing, and does not free a lock someone else took since", (t) => {
  const file = lockFile(t);
  const first = takeLock(file, taken);
  first.release();
  const second = takeLock(file, taken);

  first.release();

  assert.throws(() => takeLock(file, taken), Taken);
  second.release();
});

test("different files have different locks", (t) => {
  const one = takeLock(lockFile(t), taken);
  const two = takeLock(lockFile(t), taken);
  one.release();
  two.release();
});

test("a lock that cannot be opened is not mistaken for one that is held", (t) => {
  const file = lockFile(t);
  mkdirSync(file);

  assert.throws(
    () => takeLock(file, taken),
    (error) => error instanceof Error && !(error instanceof Taken),
  );
});

test("a process that holds a lock keeps others out, and a killed one frees it", async (t) => {
  const file = lockFile(t);
  const script = `
    import { takeLock } from ${JSON.stringify(lockModule)};
    // Held in a global: a lock nothing refers to is closed when it is collected.
    globalThis.lock = takeLock(${JSON.stringify(file)}, (cause) => cause);
    console.log("locked");
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGKILL");
    await once(child, "exit");
  });
  await once(child.stdout, "data");

  assert.throws(() => takeLock(file, taken), Taken);

  child.kill("SIGKILL");
  await once(child, "exit");
  takeLock(file, taken).release();
});
