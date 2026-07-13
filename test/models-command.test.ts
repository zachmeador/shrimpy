import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cmdModels } from "../dist/commands/models.js";
import { runCommand } from "../dist/commands/framework.js";
import {
  createChannelSessionKey,
  createLocalSessionKey,
} from "../dist/sessions/identity.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";
import {
  setupInit,
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-models-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("cmdModels", () => {
  test("uses shared usage errors for unknown subcommands", async () => {
    const topLevel = await captureLogs(() =>
      runCommand(cmdModels, ["bogus"], { workspace } as any)
    );

    assert.equal(topLevel.result, 1);
    assert.match(topLevel.errors.join("\n"), /unknown subcommand: bogus/);
    assert.match(topLevel.errors.join("\n"), /shrimpy models resolve/);

    const nested = await captureLogs(() =>
      runCommand(cmdModels, ["policies", "bogus"], { workspace } as any)
    );

    assert.equal(nested.result, 1);
    assert.match(nested.errors.join("\n"), /unknown subcommand: bogus/);
    assert.match(nested.errors.join("\n"), /shrimpy models policies show/);
  });

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
      cmdModels(["resolve", "--agent", "shrimpy", "--session", "local/tui", "--json"], config as any)
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

  test("restores channel session models through the shared persistent-session policy", async () => {
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

  test("adds a local endpoint model and sets coding policy", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdModels([
        "providers",
        "add-openai-compatible",
        "--provider",
        "local_llm",
        "--endpoint",
        "http://localhost:8090/v1",
        "--model",
        "local-coder",
        "--name",
        "Local Coder",
        "--context-window",
        "200000",
        "--max-tokens",
        "8192",
        "--thinking-format",
        "qwen-chat-template",
        "--set-coding",
        "--json",
      ], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.deepEqual(summary.model, {
      provider: "local_llm",
      id: "local-coder",
      endpoint: "http://localhost:8090/v1",
    });

    const models = JSON.parse(
      readFileSync(join(workspace, "state", "pi", "models.json"), "utf-8"),
    );
    assert.deepEqual(models.providers.local_llm.compat, {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      thinkingFormat: "qwen-chat-template",
    });
    assert.deepEqual(models.providers.local_llm.models[0], {
      id: "local-coder",
      name: "Local Coder",
      reasoning: false,
      input: ["text"],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      contextWindow: 200000,
      maxTokens: 8192,
    });

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    assert.deepEqual(config.modelPolicies.coding.candidates, [{
      provider: "local_llm",
      id: "local-coder",
    }]);
  });

  test("passes Pi-native thinking format values through", async () => {
    await setupInit(workspace);

    const captured = await captureLogs(() =>
      cmdModels([
        "providers",
        "add-openai-compatible",
        "--provider",
        "local_llm",
        "--model",
        "local-coder",
        "--thinking-format",
        "qwen",
        "--json",
      ], { workspace } as any)
    );

    assert.equal(captured.result, 0);
    const models = JSON.parse(
      readFileSync(join(workspace, "state", "pi", "models.json"), "utf-8"),
    );
    assert.equal(models.providers.local_llm.compat.thinkingFormat, "qwen");
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
  const descriptor = createSessionDescriptor({
    agentRoot,
    key: createLocalSessionKey({ agentId: "shrimpy", name: label }),
    purpose: label,
    delivery: { kind: "transcript" },
  });
  assert.equal(descriptor.storage.kind, "durable");
  writeSessionModel(join(descriptor.storage.dir, `${label}-active.jsonl`), provider, id);
}

function writeGatewaySessionModel(channel: string, provider: string, id: string): void {
  const agentRoot = join(workspace, "agents", "shrimpy");
  const descriptor = createSessionDescriptor({
    agentRoot,
    key: createChannelSessionKey({ agentId: "shrimpy", channel }),
    purpose: "channel",
    delivery: { kind: "channel", channel },
  });
  assert.equal(descriptor.storage.kind, "durable");
  writeSessionModel(join(descriptor.storage.dir, `${channel}-active.jsonl`), provider, id);
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
