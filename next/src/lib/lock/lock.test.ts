import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { startChild, tempDir } from "../testing/index.ts";
import { isLocked, takeLock } from "./index.ts";

const lockModule = new URL("./index.ts", import.meta.url).href;

class Taken extends Error {}
const taken = (cause: Error): Error => new Taken("taken", { cause });

function lockFile(t: TestContext): string {
  return join(tempDir(t, "lock"), "x.lock");
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
  assert.equal(isLocked(Object.assign(new Error("database is locked"), { errcode: 5 + 256 })), true);
  assert.equal(isLocked(Object.assign(new Error("database table is locked"), { errcode: 6 })), false);
  assert.equal(isLocked(Object.assign(new Error("unable to open database file"), { errcode: 14 })), false);
  assert.equal(isLocked("database is locked"), false);
  assert.equal(isLocked(undefined), false);
});

test("an error with no code is judged by its message", () => {
  assert.equal(isLocked(new Error("database is locked")), true);
  assert.equal(isLocked(new Error("unable to open database file")), false);
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
  const source = `
    import { takeLock } from ${JSON.stringify(lockModule)};
    // Held in a global: a lock nothing refers to is closed when it is collected.
    globalThis.lock = takeLock(${JSON.stringify(file)}, (cause) => cause);
    console.log(JSON.stringify({ event: "locked" }));
    setInterval(() => {}, 1000);
  `;
  const holder = await startChild(t, { source });

  assert.throws(() => takeLock(file, taken), Taken);

  await holder.kill("SIGKILL");
  takeLock(file, taken).release();
});
