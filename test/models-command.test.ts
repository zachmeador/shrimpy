import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cmdModels } from "../dist/commands/models.js";
import {
  createGatewaySessionDescriptor,
  createLocalSessionDescriptor,
} from "../dist/sessions/spec.js";
import { setupInit } from "../dist/setup/init.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-models-command-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = originalLog;
  }
}

describe("cmdModels", () => {
  test("lists model policies, agent defaults, and available provider models", async () => {
    await setupInit(workspace);
    writeModelsJson({
      providers: {
        configured_provider: modelProvider(["configured-model"]),
        other_provider: modelProvider(["other-model"]),
      },
    });
    const config = configWithModelPolicy("configured_provider", "configured-model");

    const { result, lines } = await captureLogs(() =>
      cmdModels(["--json"], config as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.modelPolicies[0].name, "coding");
    assert.deepEqual(summary.modelPolicies[0].resolution.selected, {
      provider: "configured_provider",
      id: "configured-model",
    });
    assert.equal(summary.agentDefaults[0].id, "shrimpy");
    assert.equal(summary.agentDefaults[0].policy, "coding");
    assert.deepEqual(summary.agentDefaults[0].selected, {
      provider: "configured_provider",
      id: "configured-model",
    });
    assert.equal(summary.agentDefaults[0].usable, true);
    assert.deepEqual(
      summary.providers.map((provider: any) => provider.provider),
      ["configured_provider", "other_provider"],
    );
    assert.deepEqual(summary.problems, []);
  });

  test("resolves local sessions from a recorded session model before the agent default", async () => {
    await setupInit(workspace);
    writeModelsJson({
      providers: {
        configured_provider: modelProvider(["configured-model"]),
        selected_provider: modelProvider(["selected-model"]),
      },
    });
    writeLocalSessionModel("tui", "selected_provider", "selected-model");
    const config = configWithModelPolicy("configured_provider", "configured-model");

    const { result, lines } = await captureLogs(() =>
      cmdModels(["resolve", "--agent", "shrimpy", "--session", "tui", "--json"], config as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.session.restoreSavedModel, true);
    assert.deepEqual(summary.session.recordedModel, {
      provider: "selected_provider",
      id: "selected-model",
    });
    assert.deepEqual(summary.effective, {
      source: "saved-session",
      model: {
        provider: "selected_provider",
        id: "selected-model",
      },
    });
  });

  test("reports channel session model records without making them the restart default", async () => {
    await setupInit(workspace);
    writeModelsJson({
      providers: {
        configured_provider: modelProvider(["configured-model"]),
        selected_provider: modelProvider(["selected-model"]),
      },
    });
    writeGatewaySessionModel("home", "selected_provider", "selected-model");
    const config = configWithModelPolicy("configured_provider", "configured-model");

    const { result, lines } = await captureLogs(() =>
      cmdModels(["resolve", "--agent", "shrimpy", "--channel", "home", "--json"], config as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.session.restoreSavedModel, false);
    assert.deepEqual(summary.session.recordedModel, {
      provider: "selected_provider",
      id: "selected-model",
    });
    assert.deepEqual(summary.effective, {
      source: "policy",
      policy: "coding",
      model: {
        provider: "configured_provider",
        id: "configured-model",
      },
    });
  });

  test("mutates model policies through CLI commands", async () => {
    await setupInit(workspace);

    let captured = await captureLogs(() =>
      cmdModels([
        "policies",
        "set",
        "coding",
        "--candidate",
        "openai/gpt5.5",
        "--json",
      ], { workspace } as any)
    );
    assert.equal(captured.result, 0);
    assert.equal(JSON.parse(captured.lines.join("\n")).modelPolicy.candidates.length, 1);

    captured = await captureLogs(() =>
      cmdModels([
        "policies",
        "add-candidate",
        "coding",
        "anthropic/claudeopus",
        "--index",
        "0",
        "--json",
      ], { workspace } as any)
    );
    assert.equal(captured.result, 0);

    captured = await captureLogs(() =>
      cmdModels([
        "policies",
        "move-candidate",
        "coding",
        "openai/gpt5.5",
        "--index",
        "0",
      ], { workspace } as any)
    );
    assert.equal(captured.result, 0);

    captured = await captureLogs(() =>
      cmdModels([
        "policies",
        "remove-candidate",
        "coding",
        "anthropic/claudeopus",
      ], { workspace } as any)
    );
    assert.equal(captured.result, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    assert.deepEqual(config.modelPolicies.coding.candidates, [{
      provider: "openai",
      id: "gpt5.5",
    }]);
  });
});

function configWithModelPolicy(provider: string, id: string): Record<string, unknown> {
  return {
    workspace,
    modelPolicies: {
      coding: {
        candidates: [{ provider, id }],
      },
    },
    agents: [{
      id: "shrimpy",
      root: "agents/shrimpy",
      modelPolicy: "coding",
    }],
  };
}

function writeLocalSessionModel(label: string, provider: string, id: string): void {
  const agentRoot = join(workspace, "agents", "shrimpy");
  const descriptor = createLocalSessionDescriptor({
    workspacePath: agentRoot,
    agentId: "shrimpy",
    label,
    kind: label,
    channel: label,
  });
  writeSessionModel(join(descriptor.sessionDir, `${label}-active.jsonl`), provider, id);
}

function writeGatewaySessionModel(channel: string, provider: string, id: string): void {
  const agentRoot = join(workspace, "agents", "shrimpy");
  const descriptor = createGatewaySessionDescriptor({
    workspacePath: agentRoot,
    agentId: "shrimpy",
    channel,
  });
  writeSessionModel(join(descriptor.sessionDir, `${channel}-active.jsonl`), provider, id);
}

function writeSessionModel(path: string, provider: string, id: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    path,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id: path,
      timestamp: now,
      cwd: workspace,
    })}\n${JSON.stringify({
      type: "model_change",
      id: "model",
      parentId: null,
      timestamp: now,
      provider,
      modelId: id,
    })}\n`,
    "utf-8",
  );
}

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
