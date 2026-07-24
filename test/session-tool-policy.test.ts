import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveRuntimeConfig } from "../dist/config/runtime.js";
import { resolveContextConfig } from "../dist/context/spec.js";
import { createBootstrap } from "../dist/sessions/bootstrap.js";
import { createLocalSessionKey } from "../dist/sessions/identity.js";
import { disposeSession, openSession } from "../dist/sessions/open.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";

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
    writeModelsJson({
      providers: {
        test: modelProvider(["test-model"]),
      },
    });

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
    const model = bootstrap.modelRegistry.find("test", "test-model");
    assert.ok(model);

    const session = await openSession(bootstrap, {
      descriptor: createSessionDescriptor({
        agentRoot,
        key: createLocalSessionKey({ agentId: "shrimpy", name: "policy" }),
        purpose: "run",
        delivery: { kind: "transcript" },
      }),
      toolPolicy: {
        excludedToolNames: ["bash"],
      },
      model,
    });

    try {
      assert.equal(session.getActiveToolNames().includes("bash"), false);
      assert.equal(session.getAllTools().some((tool: any) => tool.name === "bash"), false);
      assert.equal(session.getActiveToolNames().includes("read"), true);
    } finally {
      disposeSession(session);
    }
  });
});

function writeModelsJson(value: unknown): void {
  const stateDir = join(workspace, "state", "pi");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    join(stateDir, "models.json"),
    JSON.stringify(value, null, 2),
    "utf-8",
  );
}

function modelProvider(modelIds: string[]): Record<string, unknown> {
  return {
    baseUrl: "http://localhost:8080/v1",
    apiKey: "local",
    api: "openai-completions",
    models: modelIds.map((id) => ({
      id,
      name: id,
      input: ["text"],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      maxTokens: 8192,
    })),
  };
}
