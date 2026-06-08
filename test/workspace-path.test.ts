import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultWorkspacePath,
  resolveWorkspacePath,
  workspacePointerPath,
} from "../dist/config/workspace.js";

describe("workspace path resolution", () => {
  test("defaults to .shrimpy under the user's home directory", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    try {
      assert.equal(defaultWorkspacePath(home), join(home, ".shrimpy"));
      assert.equal(resolveWorkspacePath(home), join(home, ".shrimpy"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("uses ~/.shrimpy-workspace.json when it points at a workspace", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    const workspace = join(tmpdir(), "custom-shrimpy-workspace");
    try {
      writeFileSync(
        workspacePointerPath(home),
        `${JSON.stringify({ workspace })}\n`,
        "utf-8",
      );

      assert.equal(resolveWorkspacePath(home), workspace);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
