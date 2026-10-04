import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { runtimeDir } from "../runtime/node.ts";
import { inRuntimeDir, tempDir, useRuntimeDir } from "./index.ts";

test("a test gets a runtime directory of its own, and the setting comes back after", async (t) => {
  const before = process.env.SHRIMPY_RUNTIME_DIR;
  let inside = "";

  await t.test("a test that starts programs", (inner) => {
    inside = useRuntimeDir(inner);
    assert.equal(process.env.SHRIMPY_RUNTIME_DIR, inside);
    assert.equal(runtimeDir(), inside);
  });

  assert.equal(process.env.SHRIMPY_RUNTIME_DIR, before);
  assert.equal(existsSync(inside), false);
});

test("the directory is short enough for a socket to fit in it", (t) => {
  const directory = useRuntimeDir(t);

  assert.ok(Buffer.byteLength(`${directory}/gateway-listing.sock`) < 100);
});

test("a test inside another puts back the outer test's directory", async (t) => {
  const outer = useRuntimeDir(t);

  await t.test("a test that uses its own", (inner) => {
    assert.notEqual(useRuntimeDir(inner), outer);
  });

  assert.equal(process.env.SHRIMPY_RUNTIME_DIR, outer);
});

test("asking again in the same test gives the same directory", (t) => {
  assert.equal(useRuntimeDir(t), useRuntimeDir(t));
});

test("work can run in another runtime directory, and the test's own comes back, even after a failure", async (t) => {
  const own = useRuntimeDir(t);
  const other = tempDir(t, "other");

  const seen = await inRuntimeDir(other, () => Promise.resolve(runtimeDir()));
  await assert.rejects(
    inRuntimeDir(other, () => Promise.reject(new Error("the work failed"))),
    /the work failed/,
  );

  assert.equal(seen, other);
  assert.equal(process.env.SHRIMPY_RUNTIME_DIR, own);
});
