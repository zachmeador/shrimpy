import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { startChild, tempDir } from "../testing/index.ts";
import { takeLock } from "./node.ts";

const lockModule = new URL("./node.ts", import.meta.url).href;

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
