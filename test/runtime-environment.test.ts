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

test("createAppRuntime resolves agent cwd from workspace-relative or absolute config", () => {
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-runtime-cwd-"));
  const externalCwd = join(tmpdir(), "shrimpy-external-cwd");

  try {
    const runtime = createAppRuntime({
      workspace,
      agents: [
        { id: "shrimpy", root: "agents/shrimpy" },
        { id: "mechanic", root: "agents/mechanic", cwd: "." },
        { id: "external", root: "agents/external", cwd: externalCwd },
      ],
    });

    assert.equal(runtime.getAgentCwd("shrimpy"), join(workspace, "agents", "shrimpy"));
    assert.equal(runtime.getAgentCwd("mechanic"), workspace);
    assert.equal(runtime.getAgentCwd("external"), externalCwd);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
