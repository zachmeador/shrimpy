import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { runtimeDir } from "../runtime/node.ts";
import { useRuntimeDir } from "./index.ts";

// A test that did not isolate its sockets would meet whatever else is running on this machine.
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
