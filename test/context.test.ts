import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppRuntime } from "../dist/app/index.js";
import {
  buildTurnContext,
  markChannelSeen,
  renderTurnContext,
  resolveContextTurnConfig,
} from "../dist/context/index.js";
import {
  makeMessage,
  textContent,
} from "../dist/channels/index.js";
import {
  writeWorkers,
} from "../dist/workers/index.js";
import {
  appendWatchRunRecord,
  markWatchRunActive,
  saveWatchClockState,
} from "../dist/watches/index.js";
import {
  createChannelSessionKey,
  createLocalSessionKey,
} from "../dist/sessions/identity.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";
import { ensureSessionManifest } from "../dist/sessions/manifest.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function descriptor(agentId: string, kind: string, channel?: string) {
  return createSessionDescriptor({
    agentRoot: join(workspace, "agents", agentId),
    key: channel
      ? createChannelSessionKey({ agentId, channel })
      : createLocalSessionKey({ agentId, name: kind }),
    purpose: kind,
    delivery: channel
      ? { kind: "channel", channel }
      : { kind: "transcript" },
  });
}

function writeWorkerRecords(records: any[]): void {
  mkdirSync(join(workspace, "state"), { recursive: true });
  writeWorkers(join(workspace, "state", "workers.json"), {
    version: 1,
    workers: records,
  });
}

function workerRecord(overrides: any = {}) {
  const now = new Date().toISOString();
  const id = overrides.id ?? "wrk_test";
  return {
    id,
    ownerAgent: "shrimpy",
    backend: "codex",
    cwd: workspace,
    goal: "demo worker",
    spec: "demo worker",
    parent: {},
    status: "complete",
    createdAt: now,
    updatedAt: now,
    turns: [{
      id: `${id}_turn_1`,
      kind: "start",
      prompt: "demo worker",
      status: "complete",
      startedAt: now,
      finishedAt: now,
      output: "Created `demo/index.html`.",
    }],
    summary: "# Worker",
    ...overrides,
  };
}

describe("resolveContextTurnConfig", () => {
  test("returns small defaults", () => {
    assert.deepEqual(resolveContextTurnConfig(), {
      maxChars: 2000,
      channelUnread: {
        enabled: true,
        channels: ["*"],
        includeLatest: true,
      },
      sessionStatus: {
        enabled: true,
        staleAfterMinutes: 720,
      },
    });
  });
});

describe("buildTurnContext", () => {
  test("summarizes when the active agent has no configured watches", async () => {
    const runtime = createAppRuntime({ workspace });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "preview"),
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /watches: no configured watches for shrimpy/);
    assert.match(text, /inspect: shrimpy watches --agent shrimpy/);
  });

  test("summarizes active agent watches with bounded ordering and state", async () => {
    const now = Date.now();
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    writeFileSync(
      join(agentRoot, "watches.json"),
      JSON.stringify([
        messageWatch("active", 60_000),
        messageWatch("soon", 60_000),
        messageWatch("recent", 60_000),
        messageWatch("failed", 60_000),
        { ...messageWatch("disabled", 60_000), enabled: false },
        { ...messageWatch("extra-a", 60_000), enabled: false },
        { ...messageWatch("extra-b", 60_000), enabled: false },
      ]),
      "utf-8",
    );
    const runtime = createAppRuntime({ workspace });
    saveWatchClockState(runtime.paths.watchClockStatePath, {
      "shrimpy/soon": {
        nextRunAtMs: now + 60_000,
        scheduleKey: "test-schedule",
      },
      "shrimpy/recent": {
        nextRunAtMs: now + 3_600_000,
        scheduleKey: "test-schedule",
      },
      "shrimpy/failed": {
        nextRunAtMs: now + 7_200_000,
        scheduleKey: "test-schedule",
      },
    });
    markWatchRunActive(runtime.paths.runtimeWatchesDir, {
      ownerAgentId: "shrimpy",
      localId: "active",
      watchId: "shrimpy/active",
      runId: "run-active",
      startedAtMs: now - 30_000,
    });
    appendWatchRunRecord(runtime.paths.runtimeWatchesDir, watchRunRecord({
      localId: "recent",
      watchId: "shrimpy/recent",
      status: "success",
      finishedAtMs: now - 120_000,
    }));
    appendWatchRunRecord(runtime.paths.runtimeWatchesDir, watchRunRecord({
      localId: "failed",
      watchId: "shrimpy/failed",
      status: "failure",
      error: "network down",
      finishedAtMs: now - 60_000,
    }));

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "preview"),
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /watches: 7 configured/);
    assert.match(text, /shrimpy\/active local=active enabled/);
    assert.match(text, /active=run-active/);
    assert.match(text, /shrimpy\/soon local=soon enabled/);
    assert.match(text, /shrimpy\/recent local=recent enabled/);
    assert.match(text, /last=success/);
    assert.match(text, /shrimpy\/failed local=failed enabled/);
    assert.match(text, /diagnostic=last run failed: network down/);
    assert.match(text, /shrimpy\/disabled local=disabled disabled/);
    assert.match(text, /\+2 more/);
    assert.equal(
      text.indexOf("shrimpy/active") < text.indexOf("shrimpy/soon"),
      true,
    );
    assert.match(text, /inspect: shrimpy watches --agent shrimpy/);
  });

  test("summarizes channel messages since this agent last handled the channel", async () => {
    const runtime = createAppRuntime({ workspace });
    const channelBus = runtime.createChannelBus();
    const first = channelBus.publish({
      channel: "home",
      sender: { kind: "human", actorId: "human:user", displayName: "alice" },
      origin: { transport: "cli" },
      content: textContent("first"),
    });
    markChannelSeen(runtime, "shrimpy", "home", first.id);
    channelBus.publish({
      channel: "home",
      sender: { kind: "human", actorId: "human:user", displayName: "alice" },
      origin: { transport: "cli" },
      content: textContent("second"),
    });
    const current = channelBus.publish({
      channel: "home",
      sender: { kind: "human", actorId: "human:user", displayName: "alice" },
      origin: { transport: "cli" },
      content: textContent("third"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /^\[turn-context\]/);
    assert.match(text, /home: 2 new messages since this agent last handled it/);
    assert.match(text, /inspect: shrimpy channels read home --after /);
    assert.match(text, /latest human:alice/);
  });

  test("includes routed turn facts for surface metadata", async () => {
    const runtime = createAppRuntime({ workspace });
    const current = runtime.createChannelBus().publish({
      channel: "home",
      sender: {
        kind: "human",
        actorId: "human:alice",
        displayName: "alice",
      },
      origin: {
        transport: "telegram",
        sourceChannel: "telegram:123",
        transportChatId: "123",
        transportUserId: "456",
      },
      content: textContent("surface turn"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /routed via telegram; from human:alice; in channel home; source telegram:123; chat 123; transport user 456/);
    assert.match(text, new RegExp(`inspect: shrimpy channels read home --after ${current.id}`));
  });

  test("explains internal delivery for agent DM turns", async () => {
    const runtime = createAppRuntime({
      workspace,
      agents: [
        { id: "helper" },
        { id: "shrimpy" },
      ],
    });
    const current = runtime.createChannelBus().publish({
      channel: "dm~helper~shrimpy",
      sender: {
        kind: "agent",
        actorId: "agent:helper",
      },
      origin: {
        transport: "internal",
        sourceChannel: "dm~helper~shrimpy",
      },
      content: textContent("hello from helper"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "dm~helper~shrimpy"),
      currentMessage: current,
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /agent DM: dm~helper~shrimpy is an internal channel for helper, shrimpy; "no external adapter" only means no surface send/);
    assert.match(text, /inspect: shrimpy channels members dm~helper~shrimpy/);
  });

  test("includes addressed-agent and channel policy wake facts", async () => {
    const runtime = createAppRuntime({ workspace });
    const current = runtime.createChannelBus().publish({
      channel: "home",
      sender: {
        kind: "human",
        actorId: "human:alice",
        displayName: "alice",
      },
      origin: {
        transport: "cli",
        sourceChannel: "home",
        addressedAgentId: "shrimpy",
      },
      content: textContent("please handle this"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /addressed to shrimpy by origin.addressedAgentId/);
    assert.match(text, /wake: agent channel policy mode is all; policy owner agent:shrimpy/);
    assert.match(text, /inspect: shrimpy agent channel-policy explain shrimpy --channel home --sender human --actor-id human:alice --addressed shrimpy --text 'please handle this'/);
  });

  test("includes watch message facts", async () => {
    const runtime = createAppRuntime({ workspace });
    const current = runtime.createChannelBus().publish({
      channel: "home",
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: {
        transport: "watch",
        watchId: "daily-check",
        runId: "run-1",
        sourceChannel: "home",
        watch: {
          ownerAgentId: "shrimpy",
          localId: "daily-check",
          targetChannel: "home",
          actionKind: "message",
        },
      },
      content: textContent("watch tick"),
      timestamp: Date.parse("2026-05-02T12:00:00Z"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /routed via watch; from system:system:watch-runner; in channel home/);
    assert.match(text, /watch message; daily-check; owner shrimpy; local daily-check; target home; action message; run run-1; fired .*(Sat|Saturday).*\d{1,2}:\d{2}/);
    assert.match(text, /fired .*; UTC: 2026-05-02T12:00:00\.000Z/);
    assert.match(text, /inspect: shrimpy watches show daily-check/);
  });

  test("omits session status on watch turns with no active sessions", async () => {
    const runtime = createAppRuntime({ workspace });
    const current = makeMessage({
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: { transport: "watch", watchId: "daily-check" },
      content: textContent("watch tick"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "maintenance"),
      currentMessage: current,
    });

    assert.doesNotMatch(renderTurnContext(turnContext), /sessions: /);
  });

  test("includes relevant worker summaries on ordinary turns", async () => {
    writeWorkerRecords([
      workerRecord({
        id: "wrk_channel",
        relatedChannel: "home",
        goal: "build the counter",
        turns: [{
          id: "wrk_channel_turn_1",
          kind: "start",
          prompt: "build the counter",
          status: "complete",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          output: "Created `counter/index.html`.",
        }],
      }),
      workerRecord({
        id: "wrk_other",
        goal: "unrelated work",
      }),
    ]);
    const runtime = createAppRuntime({ workspace });
    const current = runtime.createChannelBus().publish({
      channel: "home",
      sender: { kind: "human", actorId: "human:user" },
      origin: { transport: "cli" },
      content: textContent("hello"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /worker wrk_channel complete \(current channel\).*build the counter/);
    assert.match(text, /inspect: shrimpy worker read wrk_channel/);
    assert.match(text, /workers: 1 complete owned worker need review/);
  });

  test("includes recent and stale session status on watch turns", async () => {
    writeActiveSessionFile("ops", 4 * 60 * 1000);
    writeActiveSessionFile("research", 13 * 60 * 60 * 1000);
    const runtime = createAppRuntime({ workspace });
    const current = makeMessage({
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: { transport: "watch", watchId: "daily-check" },
      content: textContent("watch tick"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "maintenance"),
      currentMessage: current,
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /sessions: 2 active across channel\/ops,channel\/research/);
    assert.match(text, /most recent channel\/ops \d+m ago/);
    assert.match(text, /1 stale >12h/);
    assert.match(text, /inspect: shrimpy sessions list/);
  });

  test("includes worker outcomes in generated session status", async () => {
    writeWorkerRecords([
      workerRecord({
        id: "wrk_blocked",
        status: "blocked",
        goal: "blocked build",
        turns: [{
          id: "wrk_blocked_turn_1",
          kind: "start",
          prompt: "blocked build",
          status: "blocked",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          output: "Blocked: missing API token.",
        }],
      }),
      workerRecord({
        id: "wrk_failed",
        status: "failed",
        goal: "failed build",
        turns: [{
          id: "wrk_failed_turn_1",
          kind: "start",
          prompt: "failed build",
          status: "failed",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          error: "test failure",
        }],
      }),
    ]);
    const runtime = createAppRuntime({ workspace });
    const current = makeMessage({
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: { transport: "watch", watchId: "daily-check" },
      content: textContent("watch tick"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "maintenance"),
      currentMessage: current,
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /workers: 1 blocked, 1 failed need review/);
    assert.match(text, /inspect: shrimpy worker list/);
    assert.doesNotMatch(text, /worker wrk_blocked blocked/);
  });

  test("omits session status on ordinary chat turns", async () => {
    writeActiveSessionFile("ops", 4 * 60 * 1000);
    const runtime = createAppRuntime({ workspace });
    const current = runtime.createChannelBus().publish({
      channel: "home",
      sender: { kind: "human", actorId: "human:user" },
      origin: { transport: "cli" },
      content: textContent("hello"),
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });

    assert.doesNotMatch(renderTurnContext(turnContext), /sessions: /);
  });

  test("accepts command turn-context JSON", async () => {
    const runtime = createAppRuntime({
      workspace,
      context: {
        sources: [{
          type: "command",
          id: "finance",
          command: "printf '{\"items\":[{\"summary\":\"bank: balance is -10000 USD\",\"inspect\":\"finance-shrimpy bank transactions --recent\"}]}'",
        }],
      },
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("finance-shrimpy", "gateway", "finance"),
      currentMessage: makeMessage({
        sender: { kind: "system", actorId: "system:test" },
        origin: { transport: "cli" },
        content: textContent("tick"),
      }),
    });
    const text = renderTurnContext(turnContext);

    assert.match(text, /bank: balance is -10000 USD/);
    assert.match(text, /inspect: finance-shrimpy bank transactions --recent/);
  });

  test("passes command source agent, channel, and session type env", async () => {
    const scriptPath = join(workspace, "env-command.js");
    writeFileSync(
      scriptPath,
      [
        "console.log(JSON.stringify({",
        "  summary: [",
        "    process.env.SHRIMPY_CONTEXT_AGENT,",
        "    process.env.SHRIMPY_CONTEXT_CHANNEL,",
        "    process.env.SHRIMPY_CONTEXT_SESSION_TYPE,",
        "    process.env.SHRIMPY_WORKSPACE,",
        "    process.env.PATH.split(':')[0],",
        "  ].join('|'),",
        "}));",
      ].join("\n"),
      "utf-8",
    );
    const runtime = createAppRuntime({
      workspace,
      context: {
        sources: [{
          type: "command",
          id: "env",
          command: `node ${scriptPath}`,
          channels: ["maintenance"],
        }],
      },
    });

    const turnContext = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "watch", "maintenance"),
      currentMessage: makeMessage({
        sender: { kind: "system", actorId: "system:watch-runner" },
        origin: { transport: "watch" },
        content: textContent("tick"),
      }),
    });

    assert.match(
      renderTurnContext(turnContext),
      new RegExp(`shrimpy\\|maintenance\\|watch\\|${escapeRegExp(workspace)}\\|${escapeRegExp(join(workspace, "runtime", "bin"))}`),
    );
  });

  test("reuses fresh command context items without rerunning the command", async () => {
    const counterPath = join(workspace, "counter.txt");
    const scriptPath = join(workspace, "counter.js");
    writeFileSync(
      scriptPath,
      [
        "const fs = require('fs');",
        `const path = ${JSON.stringify(counterPath)};`,
        "const next = fs.existsSync(path) ? Number(fs.readFileSync(path, 'utf8')) + 1 : 1;",
        "fs.writeFileSync(path, String(next));",
        "console.log(JSON.stringify({ summary: `run ${next}` }));",
      ].join("\n"),
      "utf-8",
    );
    const runtime = createAppRuntime({
      workspace,
      context: {
        sources: [{
          type: "command",
          id: "counter",
          command: `node ${scriptPath}`,
          freshForMs: 60000,
        }],
      },
    });

    const first = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "tui", "tui"),
    });
    const second = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "tui", "tui"),
    });

    assert.match(renderTurnContext(first), /run 1/);
    assert.match(renderTurnContext(second), /run 1/);
    assert.equal(readFileSync(counterPath, "utf-8"), "1");
  });

  test("does not update command freshness during preview", async () => {
    const counterPath = join(workspace, "preview-counter.txt");
    const scriptPath = join(workspace, "preview-counter.js");
    writeFileSync(
      scriptPath,
      [
        "const fs = require('fs');",
        `const path = ${JSON.stringify(counterPath)};`,
        "const next = fs.existsSync(path) ? Number(fs.readFileSync(path, 'utf8')) + 1 : 1;",
        "fs.writeFileSync(path, String(next));",
        "console.log(JSON.stringify({ summary: `preview run ${next}` }));",
      ].join("\n"),
      "utf-8",
    );
    const runtime = createAppRuntime({
      workspace,
      context: {
        sources: [{
          type: "command",
          id: "preview_counter",
          command: `node ${scriptPath}`,
          freshForMs: 60000,
        }],
      },
    });

    const preview = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "preview", "home"),
      preview: true,
    });
    const real = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
    });

    assert.match(renderTurnContext(preview), /preview run 1/);
    assert.match(renderTurnContext(real), /preview run 2/);
    assert.equal(readFileSync(counterPath, "utf-8"), "2");
  });

  test("reuses fresh command failures without retrying every turn", async () => {
    const counterPath = join(workspace, "failure-counter.txt");
    const scriptPath = join(workspace, "failure-counter.js");
    writeFileSync(
      scriptPath,
      [
        "const fs = require('fs');",
        `const path = ${JSON.stringify(counterPath)};`,
        "const next = fs.existsSync(path) ? Number(fs.readFileSync(path, 'utf8')) + 1 : 1;",
        "fs.writeFileSync(path, String(next));",
        "throw new Error(`broken ${next}`);",
      ].join("\n"),
      "utf-8",
    );
    const runtime = createAppRuntime({
      workspace,
      context: {
        sources: [{
          type: "command",
          id: "broken",
          command: `node ${scriptPath}`,
          freshForMs: 60000,
        }],
      },
    });

    const first = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "tui", "tui"),
    });
    const second = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "tui", "tui"),
    });

    assert.match(renderTurnContext(first), /broken: context command failed/);
    assert.match(renderTurnContext(first), /broken 1/);
    assert.match(renderTurnContext(second), /broken 1/);
    assert.equal(readFileSync(counterPath, "utf-8"), "1");
  });
});

function writeActiveSessionFile(channel: string, ageMs: number): void {
  const session = descriptor("shrimpy", "gateway", channel);
  ensureSessionManifest(session);
  assert.equal(session.storage.kind, "durable");
  const sessionDir = session.storage.dir;
  const path = join(sessionDir, `${channel}.jsonl`);
  writeFileSync(
    path,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id: path,
      timestamp: new Date(Date.now() - ageMs).toISOString(),
      cwd: workspace,
    })}\n`,
    "utf-8",
  );
  const when = new Date(Date.now() - ageMs);
  utimesSync(path, when, when);
}

function messageWatch(id: string, everyMs: number) {
  return {
    id,
    trigger: { kind: "time", everyMs },
    action: {
      kind: "message",
      channel: "maintenance",
      text: `${id} tick`,
    },
  };
}

function watchRunRecord(overrides: any = {}) {
  const finishedAtMs = overrides.finishedAtMs ?? Date.now();
  const startedAtMs = overrides.startedAtMs ?? finishedAtMs - 1000;
  const localId = overrides.localId ?? "recent";
  const watchId = overrides.watchId ?? `shrimpy/${localId}`;
  const status = overrides.status ?? "success";
  return {
    ownerAgentId: "shrimpy",
    localId,
    watchId,
    runId: overrides.runId ?? `run-${localId}`,
    trigger: { kind: "time", everyMs: 60_000 },
    actionKind: "message",
    startedAtMs,
    startedAtIso: new Date(startedAtMs).toISOString(),
    finishedAtMs,
    finishedAtIso: new Date(finishedAtMs).toISOString(),
    status,
    attempts: 1,
    concurrencyPolicy: "forbid",
    observation: {
      kind: status === "failure" ? "failed" : "message",
      summary: status === "failure" ? "failed" : "sent message",
    },
    emittedChannelMessageIds: [],
    ...(overrides.error ? { error: overrides.error } : {}),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
