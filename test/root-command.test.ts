import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldRunSetupBootstrapForRootShrimpy } from "../dist/commands/root.js";
import { ensureWorkspaceInitialized } from "../dist/setup/init.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-root-command-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("root shrimpy command setup path", () => {
  test("bare non-interactive CLI runs setup onboarding when setup is needed", () => {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "cli.js")],
      {
        cwd: workspace,
        env: { ...process.env, HOME: workspace },
        encoding: "utf-8",
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /shrimpy setup/);
    assert.match(result.stdout, /No working models found yet\./);
    assert.match(result.stdout, /Run `shrimpy setup` in an interactive terminal/);
    assert.equal(existsSync(join(workspace, ".shrimpy", "config", "shrimpy.json")), true);
    assert.doesNotMatch(result.stderr, /Run: shrimpy setup/);
  });

  test("blank chat non-interactive CLI prints a setup hint when setup is needed", () => {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "cli.js"), "chat"],
      {
        cwd: workspace,
        env: { ...process.env, HOME: workspace },
        encoding: "utf-8",
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Run: shrimpy setup/);
  });

  test("mechanic chat non-interactive CLI reaches the setup gate before loading config", () => {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "cli.js"), "chat", "mechanic"],
      {
        cwd: workspace,
        env: { ...process.env, HOME: workspace },
        encoding: "utf-8",
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Run: shrimpy setup/);
  });

  test("agent tui non-interactive CLI reaches the setup gate before loading config", () => {
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), "dist", "cli.js"), "agent", "tui", "career"],
      {
        cwd: workspace,
        env: { ...process.env, HOME: workspace },
        encoding: "utf-8",
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Run: shrimpy setup/);
  });

  test("runs setup when the workspace config is missing", async () => {
    assert.equal(await shouldRunSetupBootstrapForRootShrimpy(workspace), true);
  });

  test("runs setup when coding policy is missing", async () => {
    ensureWorkspaceInitialized(workspace);

    assert.equal(await shouldRunSetupBootstrapForRootShrimpy(workspace), true);
  });

  test("runs setup when coding policy candidate is unusable", async () => {
    ensureWorkspaceInitialized(workspace);
    writeModelsJson({
      providers: {
        openai: modelProvider(["gpt-5"]),
      },
    });
    writeConfig((config) => {
      config.modelPolicies = {
        coding: {
          candidates: [{ provider: "missing", id: "nope" }],
        },
      };
    });

    assert.equal(await shouldRunSetupBootstrapForRootShrimpy(workspace), true);
  });

  test("opens normal TUI when coding policy resolves", async () => {
    ensureWorkspaceInitialized(workspace);
    writeModelsJson({
      providers: {
        openai: modelProvider(["gpt-5"]),
      },
    });
    writeConfig((config) => {
      config.modelPolicies = {
        coding: {
          candidates: [{ provider: "openai", id: "gpt-5" }],
        },
      };
    });

    assert.equal(await shouldRunSetupBootstrapForRootShrimpy(workspace), false);
  });

  test("uses coding policy readiness as the setup boundary", async () => {
    ensureWorkspaceInitialized(workspace);
    writeModelsJson({
      providers: {
        openai: modelProvider(["gpt-5"]),
      },
    });
    writeConfig((config) => {
      config.modelPolicies = {
        coding: {
          candidates: [{ provider: "openai", id: "gpt-5" }],
        },
        local: {
          candidates: [{ provider: "missing", id: "nope" }],
        },
      };
      config.agents[0].modelPolicy = "local";
    });

    assert.equal(await shouldRunSetupBootstrapForRootShrimpy(workspace), false);
  });
});

function readConfig(): any {
  return JSON.parse(
    readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
  );
}

function writeConfig(edit: (config: any) => void): void {
  const config = readConfig();
  edit(config);
  writeFileSync(
    join(workspace, "config", "shrimpy.json"),
    JSON.stringify(config, null, 2) + "\n",
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
