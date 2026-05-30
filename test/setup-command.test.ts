import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
    assert.match(lines.join("\n"), /provider bootstrap session/i);
  });

  test("runSetupEntry can bootstrap a provider session and continue into setup", async () => {
    let bootstrapLaunched = false;
    let setupLaunched = false;
    let models: Array<{ provider: string; id: string }> = [];
    const lines: string[] = [];

    const result = await runSetupEntry(workspace, {
      listModels: () => models,
      canLaunchProviderBootstrap: () => true,
      launchProviderBootstrapSession: async ({ config, cwd }) => {
        bootstrapLaunched = true;
        assert.equal(config.workspace, workspace);
        assert.equal(cwd, workspace);
        models = [{ provider: "openai", id: "gpt-5" }];
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
    assert.equal(bootstrapLaunched, true);
    assert.equal(setupLaunched, true);
    assert.match(lines.join("\n"), /Launching provider bootstrap session\.\.\./);
    assert.match(lines.join("\n"), /Use Pi's \/login and \/model commands/);
    assert.match(lines.join("\n"), /Launching interactive setup session\.\.\./);
  });

  test("runSetupEntry launches the setup session when a model is available", async () => {
    let launched = false;
    const lines: string[] = [];

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
    assert.match(lines.join("\n"), /Launching interactive setup session\.\.\./);
  });

  test("runSetupEntry asks before rerunning when config already exists", async () => {
    await runSetupEntry(workspace, {
      listModels: () => [],
      log: () => {},
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
});
