import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppRuntime } from "../dist/app/index.js";
import {
  buildTurnContext,
  markChannelSeen,
  renderTurnContext,
} from "../dist/context/index.js";
import {
  makeMessage,
  textContent,
} from "../dist/channels/index.js";
import { resolveBriefingConfig } from "../dist/config/index.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-briefing-test-"));
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

describe("resolveBriefingConfig", () => {
  test("returns small defaults", () => {
    assert.deepEqual(resolveBriefingConfig(), {
      maxChars: 2000,
      channelUnread: {
        enabled: true,
        channels: ["*"],
        includeLatest: true,
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

    const briefing = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });
    const text = renderTurnContext(briefing);

    assert.match(text, /^\[briefing\]/);
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

    const briefing = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });
    const text = renderTurnContext(briefing);

    assert.match(text, /routed via telegram; from human:alice; in channel home; source telegram:123; chat 123; transport user 456/);
    assert.match(text, new RegExp(`inspect: shrimpy channels read home --after ${current.id}`));
  });

  test("includes addressed-agent and attention decision facts", async () => {
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

    const briefing = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });
    const text = renderTurnContext(briefing);

    assert.match(text, /addressed to shrimpy by origin.addressedAgentId/);
    assert.match(text, /attention: handled because message is explicitly addressed to this agent/);
    assert.match(text, /inspect: shrimpy agent attention test shrimpy --channel home --sender human --actor-id human:alice --addressed shrimpy --text 'please handle this'/);
  });

  test("includes scheduler wake facts", async () => {
    const runtime = createAppRuntime({ workspace });
    const current = runtime.createChannelBus().publish({
      channel: "home",
      sender: { kind: "system", actorId: "system:scheduler" },
      origin: {
        transport: "scheduler",
        scheduleId: "daily-check",
        runId: "run-1",
        sourceChannel: "home",
        addressedAgentId: "shrimpy",
      },
      content: textContent("scheduled tick"),
      timestamp: Date.parse("2026-05-02T12:00:00Z"),
    });

    const briefing = await buildTurnContext({
      runtime,
      descriptor: descriptor("shrimpy", "gateway", "home"),
      currentMessage: current,
    });
    const text = renderTurnContext(briefing);

    assert.match(text, /routed via scheduler; from system:system:scheduler; in channel home/);
    assert.match(text, /scheduled wake; daily-check; run run-1; fired .*(Sat|Saturday).*\d{1,2}:\d{2}/);
    assert.doesNotMatch(text, /2026-05-02T12:00:00\.000Z/);
    assert.match(text, /inspect: shrimpy gateway status/);
  });

  test("accepts command briefing JSON", async () => {
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

    const briefing = await buildTurnContext({
      runtime,
      descriptor: descriptor("finance-shrimpy", "gateway", "finance"),
      currentMessage: makeMessage({
        sender: { kind: "system", actorId: "system:test" },
        origin: { transport: "cli" },
        content: textContent("tick"),
      }),
    });
    const text = renderTurnContext(briefing);

    assert.match(text, /bank: balance is -10000 USD/);
    assert.match(text, /inspect: finance-shrimpy bank transactions --recent/);
  });

  test("reuses fresh command briefing items without rerunning the command", async () => {
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

    assert.match(renderTurnContext(first), /broken: briefing command failed/);
    assert.match(renderTurnContext(first), /broken 1/);
    assert.match(renderTurnContext(second), /broken 1/);
    assert.equal(readFileSync(counterPath, "utf-8"), "1");
  });
});
