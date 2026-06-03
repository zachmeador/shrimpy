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

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function descriptor(agentId: string, kind: string, channel?: string) {
  return {
    agentId,
    kind,
    channel,
    sessionDir: join(workspace, "sessions", agentId, channel ?? kind),
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
    assert.doesNotMatch(text, /2026-05-02T12:00:00\.000Z/);
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

    assert.match(text, /sessions: 2 active across #ops,#research/);
    assert.match(text, /most recent ops \d+m ago/);
    assert.match(text, /1 stale >12h/);
    assert.match(text, /inspect: shrimpy sessions list --json/);
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
  const sessionDir = join(workspace, "agents", "shrimpy", "sessions", channel);
  mkdirSync(sessionDir, { recursive: true });
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
