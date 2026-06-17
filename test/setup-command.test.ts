import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { runCommand } from "../dist/commands/framework.js";
import { cmdSetup } from "../dist/commands/setup.js";
import {
  createSetupInteractiveSessionSpec,
  runSetupOnboarding,
} from "../dist/setup/onboarding.js";
import {
  launchModelAccessOnboarding,
  listAvailableSetupModels,
} from "../dist/setup/model-access.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-setup-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("setup entry", () => {
  test("setup session runs as mechanic with setup skill through coding", () => {
    assert.deepEqual(
      createSetupInteractiveSessionSpec({
        config: { workspace } as any,
        cwd: workspace,
      }),
      {
        agentId: "mechanic",
        channel: "setup",
        sessionType: "tui",
        initialMessage: "Begin setup.",
        skills: ["shrimpy-setup"],
        modelPolicy: "coding",
        cwd: workspace,
      },
    );
  });

  test("cmdSetup with no target initializes the workspace and reports interactive model access setup when non-interactive", async () => {
    const { result, lines } = await captureLogs(() =>
      cmdSetup([], { workspace } as any)
    );

    assert.equal(result, 1);
    assert.equal(existsSync(join(workspace, "config", "shrimpy.json")), true);
    assert.match(lines.join("\n"), /No working models found yet\./);
    assert.match(lines.join("\n"), /Run `shrimpy setup` in an interactive terminal/);
    assert.doesNotMatch(lines.join("\n"), /Launching .*TUI/i);
  });

  test("setup init is not a subcommand", async () => {
    const { result, errors } = await captureLogs(() =>
      runCommand(cmdSetup, ["init"], { workspace } as any)
    );

    assert.equal(result, 1);
    assert.equal(existsSync(join(workspace, "config", "shrimpy.json")), false);
    assert.match(errors.join("\n"), /unknown subcommand: init/);
  });

  test("runSetupOnboarding can launch model access setup and continue into mechanic setup", async () => {
    let modelOnboardingLaunched = false;
    let setupLaunched = false;
    let models: Array<{ provider: string; id: string }> = [];
    const lines: string[] = [];

    const result = await runSetupOnboarding(workspace, {
      listModels: () => models,
      canRunInteractiveModelOnboarding: () => true,
      launchModelAccessOnboarding: async ({ workspace: inputWorkspace, cwd }) => {
        modelOnboardingLaunched = true;
        assert.equal(inputWorkspace, workspace);
        assert.equal(cwd, workspace);
        models = [{ provider: "openai", id: "gpt-5" }];
        writeModelsJson({
          providers: {
            openai: modelProvider(["gpt-5"]),
          },
        });
      },
      launchSetupSession: async () => {
        setupLaunched = true;
      },
      cwd: workspace,
      log: (line) => {
        lines.push(line);
      },
    });

    assert.equal(result.kind, "setup_started");
    assert.equal(modelOnboardingLaunched, true);
    assert.equal(setupLaunched, true);
    assert.match(lines.join("\n"), /No working models found yet\./);
    assert.match(lines.join("\n"), /Starting model access setup\.\.\./);
    assert.match(lines.join("\n"), /Created coding model policy from openai\/gpt-5\./);
    assert.match(lines.join("\n"), /Launching mechanic setup session\.\.\./);
    assert.match(lines.join("\n"), /shrimpy\s+open the main TUI/);
    assert.match(lines.join("\n"), /shrimpy status\s+inspect setup, workspace, and gateway status/);
  });

  test("model access wizard stores API-key auth and makes provider models available", async () => {
    const lines: string[] = [];
    const answers = ["2", "1"];
    await launchModelAccessOnboarding({
      workspace,
      cwd: workspace,
    }, {
      question: async () => answers.shift() ?? "",
      secret: async () => "sk-ant-test",
      log: (line) => {
        lines.push(line);
      },
    });

    const auth = JSON.parse(
      readFileSync(join(workspace, "state", "pi", "auth.json"), "utf-8"),
    );
    assert.deepEqual(auth.anthropic, {
      type: "api_key",
      key: "sk-ant-test",
    });
    assert.equal(
      listAvailableSetupModels(workspace).some((model) => model.provider === "anthropic"),
      true,
    );
    assert.match(lines.join("\n"), /Model access setup/);
    assert.match(lines.join("\n"), /Saved API key for Anthropic\./);
  });

  test("model access wizard stores a local no-auth endpoint model", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false }) as any;
    const lines: string[] = [];
    const answers = [
      "1",
      "http://localhost:8090/v1",
      "local_qwen",
      "Qwen3.6-27B-UD-Q6_K_XL",
      "Qwen 3.6 27B UD Q6_K_XL (local)",
      "200000",
      "8192",
      "dense",
      "",
      "",
    ];

    try {
      await launchModelAccessOnboarding({
        workspace,
        cwd: workspace,
      }, {
        question: async () => answers.shift() ?? "",
        secret: async () => "unused",
        log: (line) => {
          lines.push(line);
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const models = JSON.parse(
      readFileSync(join(workspace, "state", "pi", "models.json"), "utf-8"),
    );
    assert.equal(models.providers.local_qwen.baseUrl, "http://localhost:8090/v1");
    assert.equal(models.providers.local_qwen.apiKey, "local");
    assert.deepEqual(models.providers.local_qwen.compat, {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      thinkingFormat: "qwen-chat-template",
    });
    assert.equal(
      listAvailableSetupModels(workspace).some((model) =>
        model.provider === "local_qwen" && model.id === "Qwen3.6-27B-UD-Q6_K_XL"
      ),
      true,
    );
    assert.match(lines.join("\n"), /Configure a local OpenAI-compatible endpoint\./);
    assert.match(lines.join("\n"), /Saved local model local_qwen\/Qwen3\.6-27B-UD-Q6_K_XL\./);
  });

  test("runSetupOnboarding launches the setup session when a model is available", async () => {
    let launched = false;
    const lines: string[] = [];
    writeModelsJson({
      providers: {
        openai: modelProvider(["gpt-5"]),
      },
    });

    const result = await runSetupOnboarding(workspace, {
      listModels: () => [{ provider: "openai", id: "gpt-5" }],
      launchSetupSession: async ({ config, cwd }) => {
        launched = true;
        assert.equal(config.workspace, workspace);
        assert.equal(cwd, workspace);
      },
      log: (line) => {
        lines.push(line);
      },
    });

    assert.equal(result.kind, "setup_started");
    assert.equal(launched, true);
    assert.match(lines.join("\n"), /Found 1 available model: openai\/gpt-5\./);
    assert.match(lines.join("\n"), /Created coding model policy from openai\/gpt-5\./);
    assert.match(lines.join("\n"), /Launching mechanic setup session\.\.\./);
    assert.match(lines.join("\n"), /shrimpy\s+open the main TUI/);
    assert.match(lines.join("\n"), /shrimpy status\s+inspect setup, workspace, and gateway status/);
    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    assert.deepEqual(config.modelPolicies.coding.candidates, [{
      provider: "openai",
      id: "gpt-5",
    }]);
    assert.equal(config.agents.find((agent: any) => agent.id === "shrimpy")?.modelPolicy, "coding");
    assert.equal(config.agents.find((agent: any) => agent.id === "mechanic")?.modelPolicy, "coding");
  });

  test("runSetupOnboarding asks before rerunning when config already exists", async () => {
    await runSetupOnboarding(workspace, {
      listModels: () => [],
      log: () => {},
    });
    writeModelsJson({
      providers: {
        openai: modelProvider(["gpt-5"]),
      },
    });

    let launched = false;
    const lines: string[] = [];

    const result = await runSetupOnboarding(workspace, {
      listModels: () => [{ provider: "openai", id: "gpt-5" }],
      confirmExistingConfig: async (configPath) => {
        assert.match(configPath, /config\/shrimpy\.json$/);
        return false;
      },
      launchSetupSession: async () => {
        launched = true;
      },
      log: (line) => {
        lines.push(line);
      },
    });

    assert.equal(result.kind, "skipped_existing_config");
    assert.equal(launched, false);
    assert.match(lines.join("\n"), /Setup rerun cancelled\./);
  });

  test("runSetupOnboarding does nothing when coding policy and agent workspace already exist", async () => {
    await runSetupOnboarding(workspace, {
      listModels: () => [],
      log: () => {},
    });
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

    let launched = false;
    const lines: string[] = [];
    const result = await runSetupOnboarding(workspace, {
      listModels: () => [{ provider: "openai", id: "gpt-5" }],
      confirmExistingConfig: async () => {
        throw new Error("setup should not ask to rerun");
      },
      launchSetupSession: async () => {
        launched = true;
      },
      log: (line) => {
        lines.push(line);
      },
    });

    assert.equal(result.kind, "already_configured");
    assert.equal(launched, false);
    assert.match(lines.join("\n"), /Nothing to do\./);
    assert.match(lines.join("\n"), /shrimpy mechanic/);
    assert.match(lines.join("\n"), /shrimpy setup telegram/);
    const config = readConfig();
    assert.deepEqual(config.modelPolicies.coding.candidates, [{
      provider: "openai",
      id: "gpt-5",
    }]);
  });

  test("runSetupOnboarding reports unresolved coding policy without overwriting it", async () => {
    await runSetupOnboarding(workspace, {
      listModels: () => [],
      log: () => {},
    });
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

    let launched = false;
    const lines: string[] = [];
    const result = await runSetupOnboarding(workspace, {
      listModels: () => [{ provider: "openai", id: "gpt-5" }],
      confirmReplaceModelPolicy: async () => false,
      launchSetupSession: async () => {
        launched = true;
      },
      log: (line) => {
        lines.push(line);
      },
    });

    assert.equal(result.kind, "needs_policy");
    assert.equal(launched, false);
    assert.deepEqual(result.policyProblems?.[0], {
      policy: "coding",
      problems: ["model not found: missing/nope"],
    });
    assert.match(lines.join("\n"), /Proposed coding replacement: missing\/nope -> openai\/gpt-5\./);
    assert.match(lines.join("\n"), /shrimpy models policies show coding/);
    const config = readConfig();
    assert.deepEqual(config.modelPolicies.coding.candidates, [{
      provider: "missing",
      id: "nope",
    }]);
  });

  test("runSetupOnboarding replaces unresolved coding policy after confirmation", async () => {
    await runSetupOnboarding(workspace, {
      listModels: () => [],
      log: () => {},
    });
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
    rmSync(join(workspace, "agents", "mechanic", "context", "scope.md"), {
      recursive: true,
      force: true,
    });

    let launched = false;
    const result = await runSetupOnboarding(workspace, {
      listModels: () => [{ provider: "openai", id: "gpt-5" }],
      confirmReplaceModelPolicy: async () => true,
      confirmExistingConfig: async () => true,
      launchSetupSession: async () => {
        launched = true;
      },
      log: () => {},
    });

    assert.equal(result.kind, "setup_started");
    assert.equal(launched, true);
    const config = readConfig();
    assert.deepEqual(config.modelPolicies.coding.candidates, [{
      provider: "openai",
      id: "gpt-5",
    }]);
  });

  test("runSetupOnboarding does not block setup on a separate agent policy", async () => {
    await runSetupOnboarding(workspace, {
      listModels: () => [],
      log: () => {},
    });
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
    rmSync(join(workspace, "agents", "mechanic", "context", "scope.md"), {
      recursive: true,
      force: true,
    });

    let launched = false;
    const lines: string[] = [];
    const result = await runSetupOnboarding(workspace, {
      listModels: () => [{ provider: "openai", id: "gpt-5" }],
      confirmExistingConfig: async () => true,
      launchSetupSession: async () => {
        launched = true;
      },
      log: (line) => {
        lines.push(line);
      },
    });

    assert.equal(result.kind, "setup_started");
    assert.equal(launched, true);
    assert.doesNotMatch(lines.join("\n"), /missing\/nope/);
    const config = readConfig();
    assert.deepEqual(config.modelPolicies.local.candidates, [{
      provider: "missing",
      id: "nope",
    }]);
    assert.equal(config.agents[0].modelPolicy, "local");
  });

  test("runSetupOnboarding does not inspect separate policies once setup is already configured", async () => {
    await runSetupOnboarding(workspace, {
      listModels: () => [],
      log: () => {},
    });
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
          candidates: [{ provider: "local", id: "private" }],
        },
      };
      config.agents[0].modelPolicy = "local";
    });

    let launched = false;
    const lines: string[] = [];
    const result = await runSetupOnboarding(workspace, {
      listModels: () => [{ provider: "openai", id: "gpt-5" }],
      launchSetupSession: async () => {
        launched = true;
      },
      log: (line) => {
        lines.push(line);
      },
    });

    assert.equal(result.kind, "already_configured");
    assert.equal(launched, false);
    assert.match(lines.join("\n"), /Nothing to do\./);
    assert.match(lines.join("\n"), /shrimpy mechanic/);
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
