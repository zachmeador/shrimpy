import assert from "node:assert/strict";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { test, type TestContext } from "node:test";
import { stopAfter, tempDir } from "./index.ts";

/** A test that ends when told to, so cleanup can be looked at, and can fail, without failing this file. */
function endlessTest(): { t: TestContext; end: () => Promise<void> } {
  const hooks: (() => unknown)[] = [];
  const t = { after: (hook: () => unknown) => void hooks.push(hook) } as unknown as TestContext;
  return {
    t,
    async end() {
      for (const hook of hooks) await hook();
    },
  };
}

test("what a test started is stopped when it ends, newest first", async (t) => {
  const order: string[] = [];

  await t.test("a test that starts two things", (inner) => {
    stopAfter(inner, () => void order.push("first"));
    stopAfter(inner, () => void order.push("second"));
    order.push("body");
  });

  assert.deepEqual(order, ["body", "second", "first"]);
});

test("a stop that fails does not keep the others from running, and the failure is reported", async () => {
  const stopped: string[] = [];
  const { t, end } = endlessTest();
  stopAfter(t, () => void stopped.push("first"));
  stopAfter(t, () => {
    throw new Error("could not stop");
  });
  stopAfter(t, async () => {
    await Promise.resolve();
    stopped.push("last");
  });

  await assert.rejects(end(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(
      error.errors.map((cause: Error) => cause.message),
      ["could not stop"],
    );
    return true;
  });
  assert.deepEqual(stopped, ["last", "first"]);
});

test("a temporary directory exists for the test, and is removed with its contents after", async (t) => {
  let directory = "";

  await t.test("a test that uses a directory", (inner) => {
    directory = tempDir(inner, "cleanup");
    writeFileSync(join(directory, "file.txt"), "kept until the test ends");
    assert.match(basename(directory), /^shrimpy-cleanup-/);
    assert.deepEqual(readdirSync(directory), ["file.txt"]);
  });

  assert.equal(existsSync(directory), false);
});

test("two temporary directories are different", (t) => {
  assert.notEqual(tempDir(t, "same"), tempDir(t, "same"));
});
