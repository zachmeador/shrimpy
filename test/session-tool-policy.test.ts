import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveRuntimeConfig } from "../dist/config/runtime.js";
import { resolveContextConfig } from "../dist/context/index.js";
import {
  createBootstrap,
  openSession,
} from "../dist/sessions/index.js";
import { createLocalSessionDescriptor } from "../dist/sessions/spec.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-session-tool-policy-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("session tool policy", () => {
  test("excludes disabled Pi tools when opening a session", async () => {
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });

    const bootstrap = await createBootstrap({
      config: { workspace },
      agentId: "shrimpy",
      agentRootPath: agentRoot,
      workspacePath: workspace,
      authPath: join(workspace, "state", "pi", "auth.json"),
      modelsPath: join(workspace, "state", "pi", "models.json"),
      contextConfig: resolveContextConfig({ sources: [], env: [] }),
      runtimeConfig: resolveRuntimeConfig({ noSkills: true }),
    });

    const session = await openSession(bootstrap, {
      descriptor: createLocalSessionDescriptor({
        workspacePath: agentRoot,
        agentId: "shrimpy",
        label: "policy",
        kind: "run",
      }),
      toolPolicy: {
        excludedToolNames: ["bash"],
      },
    });

    try {
      assert.equal(session.getActiveToolNames().includes("bash"), false);
      assert.equal(session.getAllTools().some((tool: any) => tool.name === "bash"), false);
      assert.equal(session.getActiveToolNames().includes("read"), true);
    } finally {
      session.dispose();
    }
  });
});
