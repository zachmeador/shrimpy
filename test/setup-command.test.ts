import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cmdSetup } from "../dist/commands/setup.js";
import { runSetupEntry } from "../dist/setup/service.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-setup-command-test-"));
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

describe("setup entry", () => {
  test("cmdSetup with no target initializes the workspace and stops when no models exist", async () => {
    const { result, lines } = await captureLogs(() =>
      cmdSetup([], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.equal(existsSync(join(workspace, "config", "shrimpy.json")), true);
    assert.match(lines.join("\n"), /No working models found yet\./);
    assert.match(lines.join("\n"), /model setup session/i);
  });

  test("runSetupEntry can launch a model setup session and continue into setup", async () => {
    let modelSetupLaunched = false;
    let setupLaunched = false;
    let models: Array<{ provider: string; id: string }> = [];
    const lines: string[] = [];

    const result = await runSetupEntry(workspace, {
      listModels: () => models,
      canLaunchProviderBootstrap: () => true,
      launchProviderBootstrapSession: async ({ config, cwd }) => {
        modelSetupLaunched = true;
        assert.equal(config.workspace, workspace);
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
    assert.equal(modelSetupLaunched, true);
    assert.equal(setupLaunched, true);
    assert.match(lines.join("\n"), /Launching model setup session\.\.\./);
    assert.match(lines.join("\n"), /Use Pi's \/login and \/model commands/);
    assert.match(lines.join("\n"), /Launching interactive setup session\.\.\./);
  });

  test("runSetupEntry launches the setup session when a model is available", async () => {
    let launched = false;
    const lines: string[] = [];
    writeModelsJson({
      providers: {
        openai: modelProvider(["gpt-5"]),
      },
    });

    const result = await runSetupEntry(workspace, {
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
    assert.match(lines.join("\n"), /Launching interactive setup session\.\.\./);
    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    assert.deepEqual(config.modelPolicies.coding.candidates, [{
      provider: "openai",
      id: "gpt-5",
    }]);
  });

  test("runSetupEntry asks before rerunning when config already exists", async () => {
    await runSetupEntry(workspace, {
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

    const result = await runSetupEntry(workspace, {
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

  test("runSetupEntry does nothing when coding policy and agent context already exist", async () => {
    await runSetupEntry(workspace, {
      listModels: () => [],
      log: () => {},
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
    const result = await runSetupEntry(workspace, {
      listModels: () => {
        throw new Error("setup should not inspect models");
      },
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
    const config = readConfig();
    assert.deepEqual(config.modelPolicies.coding.candidates, [{
      provider: "missing",
      id: "nope",
    }]);
  });

  test("runSetupEntry reports unresolved coding policy without overwriting it", async () => {
    await runSetupEntry(workspace, {
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
    rmSync(join(workspace, "agents", "shrimpy", "context"), {
      recursive: true,
      force: true,
    });

    let launched = false;
    const lines: string[] = [];
    const result = await runSetupEntry(workspace, {
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

  test("runSetupEntry replaces unresolved coding policy after confirmation", async () => {
    await runSetupEntry(workspace, {
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
    rmSync(join(workspace, "agents", "shrimpy", "context"), {
      recursive: true,
      force: true,
    });

    let launched = false;
    const result = await runSetupEntry(workspace, {
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

  test("runSetupEntry does not inspect separate policies once setup is already configured", async () => {
    await runSetupEntry(workspace, {
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
    const result = await runSetupEntry(workspace, {
      listModels: () => {
        throw new Error("setup should not inspect models");
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
