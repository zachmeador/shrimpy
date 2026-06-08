import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultWorkspacePath,
  homeWorkspacePointerPath,
  resolveWorkspacePath,
  workspacePointerPath,
  workspacePointerPaths,
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

  test("prefers the workspace pointer under ~/.shrimpy", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    const workspace = join(tmpdir(), "custom-shrimpy-workspace-preferred");
    try {
      mkdirSync(defaultWorkspacePath(home), { recursive: true });
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

  test("falls back to ~/.shrimpy-workspace.json", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    const workspace = join(tmpdir(), "custom-shrimpy-workspace-home");
    try {
      writeFileSync(
        homeWorkspacePointerPath(home),
        `${JSON.stringify({ workspace })}\n`,
        "utf-8",
      );

      assert.equal(resolveWorkspacePath(home), workspace);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("uses the ~/.shrimpy pointer before the home-level pointer", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    const preferredWorkspace = join(tmpdir(), "custom-shrimpy-workspace-preferred");
    const fallbackWorkspace = join(tmpdir(), "custom-shrimpy-workspace-fallback");
    try {
      mkdirSync(defaultWorkspacePath(home), { recursive: true });
      writeFileSync(
        workspacePointerPath(home),
        `${JSON.stringify({ workspace: preferredWorkspace })}\n`,
        "utf-8",
      );
      writeFileSync(
        homeWorkspacePointerPath(home),
        `${JSON.stringify({ workspace: fallbackWorkspace })}\n`,
        "utf-8",
      );

      assert.deepEqual(workspacePointerPaths(home), [
        join(home, ".shrimpy", ".shrimpy-workspace.json"),
        join(home, ".shrimpy-workspace.json"),
      ]);
      assert.equal(resolveWorkspacePath(home), preferredWorkspace);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
