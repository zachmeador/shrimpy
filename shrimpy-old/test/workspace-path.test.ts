import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  defaultWorkspacePath,
  extractGlobalWorkspace,
  resolveWorkspacePathInfo,
  resolveWorkspacePath,
  workspaceFromCwd,
  workspacePointerPath,
} from "../dist/workspace/location.js";

describe("workspace path resolution", () => {
  test("defaults to .shrimpy under the user's home directory", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    try {
      assert.equal(defaultWorkspacePath(home), join(home, ".shrimpy"));
      assert.equal(resolveWorkspacePath(home, {}, home), join(home, ".shrimpy"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("uses the workspace pointer under the user's home directory", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    const workspace = join(tmpdir(), "custom-shrimpy-workspace-home");
    try {
      writeFileSync(
        workspacePointerPath(home),
        `${JSON.stringify({ workspace })}\n`,
        "utf-8",
      );

      assert.equal(resolveWorkspacePath(home, {}, home), workspace);
      assert.deepEqual(resolveWorkspacePathInfo(home, {}, home), {
        workspace,
        source: "pointer",
        sourcePath: workspacePointerPath(home),
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("ignores the old nested pointer path", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    try {
      mkdirSync(join(defaultWorkspacePath(home)), { recursive: true });
      writeFileSync(
        join(defaultWorkspacePath(home), ".shrimpy-workspace.json"),
        `${JSON.stringify({ workspace: "/should/not/be/used" })}\n`,
        "utf-8",
      );

      assert.equal(workspacePointerPath(home), join(home, ".shrimpy-workspace.json"));
      assert.equal(resolveWorkspacePath(home, {}, home), join(home, ".shrimpy"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("SHRIMPY_WORKSPACE wins over pointers and default", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    const envWorkspace = join(tmpdir(), "custom-shrimpy-workspace-env");
    try {
      writeFileSync(
        workspacePointerPath(home),
        `${JSON.stringify({ workspace: "/should/not/be/used" })}\n`,
        "utf-8",
      );

      const env = { SHRIMPY_WORKSPACE: envWorkspace };
      assert.equal(resolveWorkspacePath(home, env, home), envWorkspace);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("a relative SHRIMPY_WORKSPACE resolves against the cwd", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    try {
      const env = { SHRIMPY_WORKSPACE: "./relative-workspace" };
      assert.equal(
        resolveWorkspacePath(home, env, home),
        resolve(home, "./relative-workspace"),
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("a blank SHRIMPY_WORKSPACE falls through to normal resolution", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    try {
      const env = { SHRIMPY_WORKSPACE: "   " };
      assert.equal(resolveWorkspacePath(home, env, home), join(home, ".shrimpy"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("discovers a cwd-local .shrimpy workspace before pointers", () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-home-"));
    const project = mkdtempSync(join(tmpdir(), "shrimpy-project-"));
    const workspace = join(project, ".shrimpy");
    const nested = join(project, "packages", "app");
    try {
      mkdirSync(join(workspace, "config"), { recursive: true });
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(workspace, "config", "shrimpy.json"), "{}\n", "utf-8");
      writeFileSync(
        workspacePointerPath(home),
        `${JSON.stringify({ workspace: "/should/not/be/used" })}\n`,
        "utf-8",
      );

      assert.equal(resolveWorkspacePath(home, {}, nested), workspace);
      assert.deepEqual(resolveWorkspacePathInfo(home, {}, nested), {
        workspace,
        source: "cwd",
        sourcePath: join(workspace, "config", "shrimpy.json"),
      });
      assert.deepEqual(workspaceFromCwd(nested), {
        workspace,
        source: "cwd",
        sourcePath: join(workspace, "config", "shrimpy.json"),
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(project, { recursive: true, force: true });
    }
  });

  describe("extractGlobalWorkspace", () => {
    test("extracts a leading --workspace <path> into the env and strips it", () => {
      const env = {};
      const rest = extractGlobalWorkspace(["--workspace", "/tmp/ws", "status"], env);
      assert.deepEqual(rest, ["status"]);
      assert.equal(env.SHRIMPY_WORKSPACE, resolve("/tmp/ws"));
    });

    test("accepts the --workspace=<path> form", () => {
      const env = {};
      const rest = extractGlobalWorkspace(["--workspace=/tmp/ws", "models"], env);
      assert.deepEqual(rest, ["models"]);
      assert.equal(env.SHRIMPY_WORKSPACE, resolve("/tmp/ws"));
    });

    test("leaves a subcommand --workspace flag untouched", () => {
      const env = {};
      const argv = ["skills", "add", "foo", "--workspace"];
      const rest = extractGlobalWorkspace(argv, env);
      assert.deepEqual(rest, argv);
      assert.equal(env.SHRIMPY_WORKSPACE, undefined);
    });

    test("throws when --workspace has no path", () => {
      assert.throws(() => extractGlobalWorkspace(["--workspace"], {}));
      assert.throws(() => extractGlobalWorkspace(["--workspace", "--json"], {}));
    });
  });
});
