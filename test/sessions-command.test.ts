import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ChannelBus } from "../dist/channels/bus.js";
import { cmdSessions } from "../dist/commands/sessions.js";
import { createChannelSessionKey } from "../dist/sessions/identity.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";
import { ensureSessionManifest } from "../dist/sessions/storage.js";
import {
  setupInit,
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-sessions-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("cmdSessions", () => {
  test("searches active and archived transcripts without matching tool result bodies", async () => {
    await setupInit(workspace);
    const agentRoot = join(workspace, "agents", "shrimpy");
    const sessionDir = channelSessionDir(agentRoot, "home");
    mkdirSync(sessionDir, { recursive: true });
    writeActiveSessionFile(
      join(sessionDir, "home-active.jsonl"),
      [
        messageEntry("u1", null, "2026-05-01T10:00:00.000Z", {
          role: "user",
          content: "Please inspect the coral plan.",
        }),
        messageEntry("a1", "u1", "2026-05-01T10:01:00.000Z", {
          role: "assistant",
          content: [
            { type: "text", text: "I will check the local notes." },
            { type: "toolCall", id: "tool-1", name: "bash", arguments: { cmd: "rg coral" } },
          ],
        }),
        messageEntry("t1", "a1", "2026-05-01T10:02:00.000Z", {
          role: "toolResult",
          toolCallId: "tool-1",
          toolName: "bash",
          content: [{ type: "text", text: "secret-tool-output-only" }],
          isError: false,
        }),
      ].join(""),
    );
    writeArchivedSessionFile(
      join(sessionDir, "home-archived.jsonl"),
      messageEntry("u2", null, "2026-04-30T10:00:00.000Z", {
        role: "user",
        content: "Archived coral decision.",
      }),
    );

    const coral = await captureLogs(() =>
      cmdSessions(["search", "coral", "--json"], { workspace } as any)
    );
    assert.equal(coral.result, 0);
    const coralPayload = JSON.parse(coral.lines.join("\n"));
    assert.equal(coralPayload.matchedCount, 2);
    assert.deepEqual(
      coralPayload.matches.map((match: any) => match.lifecycleState).sort(),
      ["active", "archived"],
    );

    const toolOutput = await captureLogs(() =>
      cmdSessions(["search", "secret-tool-output-only", "--json"], { workspace } as any)
    );
    assert.equal(toolOutput.result, 0);
    assert.equal(JSON.parse(toolOutput.lines.join("\n")).matchedCount, 0);

    const toolName = await captureLogs(() =>
      cmdSessions(["search", "bash", "--json"], { workspace } as any)
    );
    assert.equal(toolName.result, 0);
    const toolPayload = JSON.parse(toolName.lines.join("\n"));
    assert.equal(toolPayload.matchedCount, 2);
    assert.deepEqual(
      toolPayload.matches.map((match: any) => match.matchKind).sort(),
      ["tool", "tool"],
    );
  });

  test("reads a bounded transcript window around a search match", async () => {
    await setupInit(workspace);
    const agentRoot = join(workspace, "agents", "shrimpy");
    const sessionDir = channelSessionDir(agentRoot, "home");
    mkdirSync(sessionDir, { recursive: true });
    writeActiveSessionFile(
      join(sessionDir, "home-active.jsonl"),
      [
        messageEntry("u1", null, "2026-05-01T10:00:00.000Z", {
          role: "user",
          content: "Before the target.",
        }),
        messageEntry("a1", "u1", "2026-05-01T10:01:00.000Z", {
          role: "assistant",
          content: [{ type: "text", text: "Needle answer in the middle." }],
        }),
        messageEntry("t1", "a1", "2026-05-01T10:02:00.000Z", {
          role: "toolResult",
          toolCallId: "tool-1",
          toolName: "bash",
          content: [{ type: "text", text: "verbose body should stay omitted" }],
          isError: false,
        }),
      ].join(""),
    );

    const search = await captureLogs(() =>
      cmdSessions(["search", "Needle", "--json"], { workspace } as any)
    );
    const match = JSON.parse(search.lines.join("\n")).matches[0];
    const read = await captureLogs(() =>
      cmdSessions([
        "read",
        match.relativePath,
        "--around",
        match.entryId,
        "--window",
        "1",
        "--json",
      ], { workspace } as any)
    );

    assert.equal(read.result, 0);
    const payload = JSON.parse(read.lines.join("\n"));
    assert.equal(payload.aroundEntryId, "a1");
    assert.deepEqual(payload.entries.map((entry: any) => entry.id), ["u1", "a1", "t1"]);
    assert.match(payload.entries[2].snippet, /body omitted/);
    assert.doesNotMatch(JSON.stringify(payload), /verbose body should stay omitted/);
  });

  test("lists one channel session as JSON", async () => {
    await setupInit(workspace);
    const agentRoot = join(workspace, "agents", "shrimpy");
    const sessionDir = channelSessionDir(agentRoot, "home");
    mkdirSync(sessionDir, { recursive: true });
    writeActiveSessionFile(join(sessionDir, "home-active.jsonl"));
    writeArchivedSessionFile(join(sessionDir, "home-123.jsonl"));

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["list", "channel/home", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.sessionId, "channel/home");
    assert.deepEqual(summary.delivery, { kind: "channel", channel: "home" });
    assert.equal(summary.active.exists, true);
    assert.equal(summary.active.name, "home-active.jsonl");
    assert.deepEqual(summary.archives.map((entry: any) => entry.name), ["home-123.jsonl"]);
  });

  test("lists all sessions as JSON", async () => {
    await setupInit(workspace);
    const agentRoot = join(workspace, "agents", "shrimpy");
    const homeDir = channelSessionDir(agentRoot, "home");
    const telegramDir = channelSessionDir(agentRoot, "telegram-123");
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
    assert.deepEqual(
      summary.sessions.map((entry: any) => entry.sessionId).sort(),
      ["channel/home", "channel/telegram-123"],
    );
    assert.deepEqual(summary.sessions[0].archives.map((entry: any) => entry.name), ["home-123.jsonl"]);
  });

  test("fails a routed thinking change when the gateway is stopped", async () => {
    await setupInit(workspace);

    const { result, lines, errors } = await captureLogs(() =>
      cmdSessions(["thinking", "channel/home", "high"], { workspace } as any)
    );

    assert.equal(result, 1);
    assert.deepEqual(lines, []);
    assert.deepEqual(errors, ["Session channel/home is not running."]);

    const bus = new ChannelBus(join(workspace, "channels"));
    const { messages } = bus.read("home");
    assert.deepEqual(messages, []);
  });

  test("maps sessions thinking on to medium before reporting a stopped gateway", async () => {
    await setupInit(workspace);

    const { result, lines, errors } = await captureLogs(() =>
      cmdSessions(["thinking", "channel/home", "on"], { workspace } as any)
    );

    assert.equal(result, 1);
    assert.deepEqual(lines, []);
    assert.deepEqual(errors, ["Session channel/home is not running."]);

    const bus = new ChannelBus(join(workspace, "channels"));
    const { messages } = bus.read("home");
    assert.deepEqual(messages, []);
  });

  test("fails a routed stop when the gateway is stopped", async () => {
    await setupInit(workspace);

    const { result, lines, errors } = await captureLogs(() =>
      cmdSessions(["stop", "channel/home"], { workspace } as any)
    );

    assert.equal(result, 1);
    assert.deepEqual(lines, []);
    assert.deepEqual(errors, ["Session channel/home is not running."]);

    const bus = new ChannelBus(join(workspace, "channels"));
    const { messages } = bus.read("home");
    assert.deepEqual(messages, []);
  });

  test("applies a gateway-channel reset directly when the gateway is stopped", async () => {
    await setupInit(workspace);
    const sessionDir = channelSessionDir(
      join(workspace, "agents", "shrimpy"),
      "home",
    );
    mkdirSync(sessionDir, { recursive: true });
    writeActiveSessionFile(join(sessionDir, "home-active.jsonl"));

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["new", "channel/home", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.outcome, "applied_direct");
    assert.equal(payload.archiveName, "home-active.jsonl");
    assert.equal(payload.sessionId, "channel/home");

    const bus = new ChannelBus(join(workspace, "channels"));
    assert.deepEqual(bus.read("home").messages, []);
  });

  test("inspects effective compaction policy as JSON", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["compaction", "channel/maintenance", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.agentId, "shrimpy");
    assert.equal(summary.sessionId, "channel/maintenance");
    assert.equal(summary.purpose, "channel");
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
    const sessionDir = channelSessionDir(agentRoot, "maintenance");
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
      cmdSessions(["compaction", "channel/maintenance", "--json"], { workspace } as any)
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
          },
        ]),
      },
    });

    const { result, lines } = await captureLogs(() =>
      cmdSessions(["compaction", "channel/maintenance", "--json"], config as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.model.provider, "configured_provider");
    assert.equal(summary.model.id, "chosen-model");
    assert.equal(summary.model.contextWindow, 200000);
    assert.equal(summary.model.inference, undefined);
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
          },
        ]),
      },
    });
    const agentRoot = join(workspace, "agents", "shrimpy");
    const sessionDir = channelSessionDir(agentRoot, "maintenance");
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
      cmdSessions(["compaction", "channel/maintenance", "--json"], config as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.recordedSession.provider, "configured_provider");
    assert.equal(summary.recordedSession.id, "old-model");
    assert.equal(summary.restartRequired, true);
    assert.match(summary.note, /different session model metadata/);
  });
});

function channelSessionDir(agentRoot: string, channel: string): string {
  const descriptor = createSessionDescriptor({
    agentRoot,
    key: createChannelSessionKey({ agentId: "shrimpy", channel }),
    purpose: "channel",
    delivery: { kind: "channel", channel },
  });
  ensureSessionManifest(descriptor);
  assert.equal(descriptor.storage.kind, "durable");
  return descriptor.storage.dir;
}

function writeActiveSessionFile(path: string, extra = ""): void {
  writeSessionFile(path, "active", extra);
}

function writeArchivedSessionFile(path: string, extra = ""): void {
  const now = new Date().toISOString();
  writeSessionFile(
    path,
    "archived",
    `${extra}${JSON.stringify({
      type: "custom",
      customType: "shrimpy_lifecycle",
      data: { state: "archived" },
      id: "archived",
      parentId: null,
      timestamp: now,
    })}\n`,
  );
}

function messageEntry(
  id: string,
  parentId: string | null,
  timestamp: string,
  message: Record<string, unknown>,
): string {
  return `${JSON.stringify({
    type: "message",
    id,
    parentId,
    timestamp,
    message: {
      timestamp: Date.parse(timestamp),
      ...message,
    },
  })}\n`;
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
