import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cmdRootTui,
  shouldRunSetupBootstrapForRootShrimpy,
} from "../dist/commands/root.js";
import { resolveCommandResult } from "../dist/commands/framework.js";
import { ensureWorkspaceInitialized } from "../dist/setup/init.js";
import {
  createChannelSessionKey,
  createLocalSessionKey,
} from "../dist/sessions/identity.js";
import { ensureSessionManifest } from "../dist/sessions/manifest.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";

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

describe("root shrimpy agent resume", () => {
  test("bare shrimpy selects the agent with the most recent terminal chat", async () => {
    const config = multiAgentConfig();
    writeInteractiveSession("shrimpy", 1_000);
    writeInteractiveSession("career", 2_000);

    const request = await captureRootLaunch([], config);

    assert.equal(request.agentId, "career");
  });

  test("keeps the agent selected after /new archives its old transcript", async () => {
    const config = multiAgentConfig();
    writeInteractiveSession("shrimpy", 1_000);
    writeInteractiveSession("career", 2_000, { archived: true });

    const request = await captureRootLaunch([], config);

    assert.equal(request.agentId, "career");
  });

  test("does not let an older archived transcript beat newer terminal activity", async () => {
    const config = multiAgentConfig();
    writeInteractiveSession("shrimpy", 2_000);
    writeInteractiveSession("career", 1_000, { archived: true });

    const request = await captureRootLaunch([], config);

    assert.equal(request.agentId, "shrimpy");
  });

  test("ignores newer channel sessions", async () => {
    const config = multiAgentConfig();
    writeInteractiveSession("shrimpy", 1_000);
    writeChannelSession("career", 2_000);

    const request = await captureRootLaunch([], config);

    assert.equal(request.agentId, "shrimpy");
  });

  test("keeps the configured default when no prior terminal chat exists", async () => {
    const request = await captureRootLaunch([], multiAgentConfig());

    assert.equal(request.agentId, undefined);
  });

  test("does not apply recent-agent resolution to a prompted root launch", async () => {
    const config = multiAgentConfig();
    writeInteractiveSession("career", 2_000);

    const request = await captureRootLaunch(["hello"], config);

    assert.equal(request.agentId, undefined);
    assert.equal(request.initialMessage, "hello");
  });

  test("explicit agent selection takes precedence", async () => {
    const config = multiAgentConfig();
    writeInteractiveSession("shrimpy", 2_000);

    const request = await captureRootLaunch(["--agent", "career"], config);

    assert.equal(request.agentId, "career");
  });
});

function multiAgentConfig(): any {
  return {
    workspace,
    agents: [
      { id: "shrimpy", root: "agents/shrimpy" },
      { id: "career", root: "agents/career" },
    ],
  };
}

async function captureRootLaunch(
  args: string[],
  config: any,
): Promise<any> {
  const result = await cmdRootTui(args, config);
  assert.notEqual(typeof result, "number");
  if (typeof result === "number") throw new Error("expected TUI command result");

  let captured: any;
  result.deps = {
    ...result.deps,
    resolveSetupState: async () => ({ kind: "ready", models: [] }),
    beforeLaunch: async () => undefined,
    loadConfig: () => config,
    launchSession: async (_runtime, request) => {
      captured = request;
    },
  };

  assert.equal(await resolveCommandResult(result, config), 0);
  assert.ok(captured);
  return captured;
}

function writeInteractiveSession(
  agentId: string,
  updatedAtMs: number,
  opts?: { archived?: boolean },
): void {
  const descriptor = createSessionDescriptor({
    agentRoot: join(workspace, "agents", agentId),
    key: createLocalSessionKey({ agentId, name: "main" }),
    purpose: "interactive",
    delivery: { kind: "transcript" },
  });
  writeSessionForDescriptor(descriptor, agentId, updatedAtMs, opts);
}

function writeChannelSession(agentId: string, updatedAtMs: number): void {
  const descriptor = createSessionDescriptor({
    agentRoot: join(workspace, "agents", agentId),
    key: createChannelSessionKey({ agentId, channel: "home" }),
    purpose: "channel",
    delivery: { kind: "channel", channel: "home" },
  });
  writeSessionForDescriptor(descriptor, agentId, updatedAtMs);
}

function writeSessionForDescriptor(
  descriptor: ReturnType<typeof createSessionDescriptor>,
  agentId: string,
  updatedAtMs: number,
  opts?: { archived?: boolean },
): void {
  ensureSessionManifest(descriptor);
  assert.equal(descriptor.storage.kind, "durable");
  if (descriptor.storage.kind !== "durable") return;

  const path = join(descriptor.storage.dir, `${agentId}.jsonl`);
  const timestamp = new Date(updatedAtMs).toISOString();
  const entries: Record<string, unknown>[] = [{
    type: "session",
    version: 3,
    id: `${agentId}-session`,
    timestamp,
    cwd: workspace,
  }];
  if (opts?.archived) {
    entries.push({
      type: "custom",
      customType: "shrimpy_lifecycle",
      data: { state: "archived" },
      id: `${agentId}-archived`,
      parentId: null,
      timestamp,
    });
  }
  writeFileSync(path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf-8");
  const updatedAt = new Date(updatedAtMs);
  utimesSync(path, updatedAt, updatedAt);
}

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
