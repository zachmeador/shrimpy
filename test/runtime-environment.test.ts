import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRuntime } from "../dist/app/index.js";

test("createAppRuntime creates runtime shims without mutating process.env", () => {
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-runtime-env-"));
  const originalWorkspace = process.env.SHRIMPY_WORKSPACE;
  const originalPath = process.env.PATH;

  try {
    const runtime = createAppRuntime({ workspace });

    assert.equal(runtime.environment.workspacePath, workspace);
    assert.equal(existsSync(join(runtime.environment.binDir, "shrimpy")), true);
    assert.equal(process.env.SHRIMPY_WORKSPACE, originalWorkspace);
    assert.equal(process.env.PATH, originalPath);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
