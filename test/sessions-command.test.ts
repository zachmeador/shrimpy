import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelBus } from "../dist/channels/bus.js";
import { cmdSessions } from "../dist/commands/sessions.js";
import { createGatewaySessionDescriptor } from "../dist/sessions/spec.js";
import { setupInit } from "../dist/setup/init.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-sessions-command-test-"));
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

describe("cmdSessions", () => {
  test("lists one channel session as JSON", async () => {
    await setupInit(workspace);
    const agentRoot = join(workspace, "agents", "shrimpy");
    const sessionDir = createGatewaySessionDescriptor({
      workspacePath: agentRoot,
      agentId: "shrimpy",
      channel: "home",
    }).sessionDir;
    mkdirSync(sessionDir, { recursive: true });
    writeActiveSessionFile(join(sessionDir, "home-active.jsonl"));
    writeArchivedSessionFile(join(sessionDir, "home-123.jsonl"));

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["list", "home", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.channel, "home");
    assert.equal(summary.active.exists, true);
    assert.equal(summary.active.name, "home-active.jsonl");
    assert.deepEqual(summary.archives.map((entry: any) => entry.name), ["home-123.jsonl"]);
  });

  test("lists all sessions as JSON", async () => {
    await setupInit(workspace);
    const agentRoot = join(workspace, "agents", "shrimpy");
    const homeDir = createGatewaySessionDescriptor({
      workspacePath: agentRoot,
      agentId: "shrimpy",
      channel: "home",
    }).sessionDir;
    const telegramDir = createGatewaySessionDescriptor({
      workspacePath: agentRoot,
      agentId: "shrimpy",
      channel: "telegram-123",
    }).sessionDir;
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(telegramDir, { recursive: true });
    writeActiveSessionFile(join(homeDir, "home-active.jsonl"));
    writeActiveSessionFile(join(telegramDir, "telegram-active.jsonl"));
    writeArchivedSessionFile(join(homeDir, "home-123.jsonl"));

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["list", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.agentId, "shrimpy");
    assert.deepEqual(summary.active.map((entry: any) => entry.channel).sort(), ["home", "telegram-123"]);
    assert.deepEqual(summary.recentArchives.map((entry: any) => entry.name), ["home-123.jsonl"]);
  });

  test("requests a thinking change for routed sessions", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["thinking", "home", "high"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.deepEqual(lines, ["requested thinking high for shrimpy on home"]);

    const bus = new ChannelBus(join(workspace, "channels"));
    const { messages } = bus.read("home");
    assert.deepEqual(messages.at(-1)?.content.data, {
      kind: "session_thinking_level",
      targetAgentId: "shrimpy",
      level: "high",
      command: "/thinking",
    });
  });

  test("maps sessions thinking on to medium", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["thinking", "home", "on"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.deepEqual(lines, ["requested thinking medium for shrimpy on home"]);

    const bus = new ChannelBus(join(workspace, "channels"));
    const { messages } = bus.read("home");
    assert.deepEqual(messages.at(-1)?.content.data, {
      kind: "session_thinking_level",
      targetAgentId: "shrimpy",
      level: "medium",
      command: "/thinking",
    });
  });

  test("inspects effective compaction policy as JSON", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["compaction", "maintenance", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.agentId, "shrimpy");
    assert.equal(summary.channel, "maintenance");
    assert.equal(summary.effective.thresholdTokens, undefined);
    assert.equal(summary.effective.reserveTokens, 32768);
    assert.equal(summary.effective.keepRecentTokens, 30000);
    assert.equal(summary.recorded, undefined);
    assert.equal(summary.restartRequired, false);
    assert.match(summary.note, /No active session file exists yet/);
  });

  test("reports stale recorded compaction policy for active sessions", async () => {
    await setupInit(workspace);
    const agentRoot = join(workspace, "agents", "shrimpy");
    const sessionDir = createGatewaySessionDescriptor({
      workspacePath: agentRoot,
      agentId: "shrimpy",
      channel: "maintenance",
    }).sessionDir;
    mkdirSync(sessionDir, { recursive: true });
    writeActiveSessionFile(
      join(sessionDir, "maintenance-active.jsonl"),
      `${JSON.stringify({
        type: "custom",
        customType: "shrimpy_compaction_policy",
        data: {
          enabled: true,
          reserveTokens: 32768,
          thresholdTokens: 229376,
          keepRecentTokens: 30000,
          matched: ["runtime.compaction"],
        },
        id: "policy",
        parentId: null,
        timestamp: new Date().toISOString(),
      })}\n`,
    );

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["compaction", "maintenance", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.recorded.thresholdTokens, 229376);
    assert.equal(summary.effective.thresholdTokens, undefined);
    assert.equal(summary.restartRequired, true);
    assert.match(summary.note, /different compaction policy/);
  });

  test("inspects the configured compaction model instead of the first registered model", async () => {
    await setupInit(workspace);
    const config = {
      workspace,
      modelPolicies: {
        coding: {
          candidates: [{
            provider: "configured_provider",
            id: "chosen-model",
          }],
        },
      },
      agents: [{
        id: "shrimpy",
        root: "agents/shrimpy",
        modelPolicy: "coding",
      }],
    };
    writeModelConfig(config);
    writeModelsJson({
      providers: {
        first_provider: modelProvider([
          {
            id: "first-model",
            contextWindow: 120000,
          },
        ]),
        configured_provider: modelProvider([
          {
            id: "chosen-model",
            contextWindow: 200000,
            baseModel: "dense",
            inference: {
              enableThinking: false,
              params: {
                temperature: 0.7,
              },
            },
          },
        ]),
      },
    });

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["compaction", "maintenance", "--json"], config as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.model.provider, "configured_provider");
    assert.equal(summary.model.id, "chosen-model");
    assert.equal(summary.model.contextWindow, 200000);
    assert.deepEqual(summary.model.inference, {
      baseModel: "dense",
      enableThinking: false,
      params: {
        temperature: 0.7,
      },
    });
    assert.equal(summary.effective.reserveTokens, 32768);
  });

  test("reports stale recorded model metadata for active sessions", async () => {
    await setupInit(workspace);
    const config = {
      workspace,
      modelPolicies: {
        coding: {
          candidates: [{
            provider: "configured_provider",
            id: "chosen-model",
          }],
        },
      },
      agents: [{
        id: "shrimpy",
        root: "agents/shrimpy",
        modelPolicy: "coding",
      }],
    };
    writeModelConfig(config);
    writeModelsJson({
      providers: {
        configured_provider: modelProvider([
          {
            id: "chosen-model",
            contextWindow: 200000,
            baseModel: "dense",
            inference: {
              enableThinking: false,
              params: {
                temperature: 0.7,
              },
            },
          },
        ]),
      },
    });
    const agentRoot = join(workspace, "agents", "shrimpy");
    const sessionDir = createGatewaySessionDescriptor({
      workspacePath: agentRoot,
      agentId: "shrimpy",
      channel: "maintenance",
    }).sessionDir;
    mkdirSync(sessionDir, { recursive: true });
    writeActiveSessionFile(
      join(sessionDir, "maintenance-active.jsonl"),
      `${JSON.stringify({
        type: "custom",
        customType: "shrimpy_session_metadata",
        data: {
          env: {
            provider: "configured_provider",
            model_id: "old-model",
            booted_at_iso: "2026-05-20T04:02:19.469Z",
          },
          inference: {
            baseModel: "old-dense",
            enableThinking: false,
            params: {
              temperature: 0.2,
            },
          },
        },
        id: "metadata",
        parentId: null,
        timestamp: new Date().toISOString(),
      })}\n${JSON.stringify({
        type: "custom",
        customType: "shrimpy_compaction_policy",
        data: recordedDefaultCompactionPolicy(),
        id: "policy",
        parentId: null,
        timestamp: new Date().toISOString(),
      })}\n`,
    );

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["compaction", "maintenance", "--json"], config as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.recordedSession.provider, "configured_provider");
    assert.equal(summary.recordedSession.id, "old-model");
    assert.equal(summary.restartRequired, true);
    assert.match(summary.note, /different session model or inference metadata/);
  });
});

function writeActiveSessionFile(path: string, extra = ""): void {
  writeSessionFile(path, "active", extra);
}

function writeArchivedSessionFile(path: string): void {
  const now = new Date().toISOString();
  writeSessionFile(
    path,
    "archived",
    `${JSON.stringify({
      type: "custom",
      customType: "shrimpy_lifecycle",
      data: { state: "archived" },
      id: "archived",
      parentId: null,
      timestamp: now,
    })}\n`,
  );
}

function writeSessionFile(path: string, id: string, extra = ""): void {
  const now = new Date().toISOString();
  writeFileSync(
    path,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id: path,
      timestamp: now,
      cwd: workspace,
    })}\n${extra}`,
    "utf-8",
  );
}

function writeModelConfig(value: unknown): void {
  writeFileSync(
    join(workspace, "config", "shrimpy.json"),
    JSON.stringify(value, null, 2),
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

function modelProvider(models: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    baseUrl: "http://localhost:8080/v1",
    apiKey: "local",
    api: "openai-completions",
    models: models.map((model) => ({
      name: model.id,
      input: ["text"],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      maxTokens: 8192,
      ...model,
    })),
  };
}

function recordedDefaultCompactionPolicy(): Record<string, unknown> {
  return {
    enabled: true,
    reserveTokens: 32768,
    keepRecentTokens: 30000,
    matched: ["runtime.compaction"],
  };
}
