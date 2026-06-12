import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cmdStatus } from "../dist/commands/status.js";
import { runSetupOnboarding } from "../dist/setup/onboarding.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-status-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("cmdStatus setup readiness", () => {
  test("prints needs model access when setup has no usable model", async () => {
    await runSetupOnboarding(workspace, {
      listModels: () => [],
      log: () => {},
    });

    const { result, lines } = await captureLogs(() =>
      cmdStatus([], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /setup:\s+needs model access - run shrimpy setup/);
  });

  test("prints ready when setup can resolve coding", async () => {
    writeModelsJson({
      providers: {
        openai: modelProvider(["gpt-5"]),
      },
    });
    await runSetupOnboarding(workspace, {
      listModels: () => [{ provider: "openai", id: "gpt-5" }],
      launchSetupSession: async () => {},
      log: () => {},
    });

    const { result, lines } = await captureLogs(() =>
      cmdStatus([], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /setup:\s+ready/);
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
