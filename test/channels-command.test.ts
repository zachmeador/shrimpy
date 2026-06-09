import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ChannelBus } from "../dist/channels/bus.js";
import { systemContent, textContent } from "../dist/channels/index.js";
import { cmdAgent } from "../dist/commands/agent.js";
import { cmdChannels } from "../dist/commands/channels.js";
import { setupInit } from "../dist/setup/init.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-channels-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

async function withMutedConsole<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}

describe("cmdChannels", () => {
  test("shows channel summaries as JSON", async () => {
    await setupInit(workspace);
    const channelBus = new ChannelBus(join(workspace, "channels"));
    channelBus.publishHumanText({
      channel: "home",
      text: "hello home",
      actorId: "human:user:alice",
      userId: "user:alice",
      displayName: "alice",
      transport: "cli",
    });

    const { result, lines } = await captureLogs(() =>
      cmdChannels(["show", "home", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.channel, "home");
    assert.equal(summary.messageCount, 1);
    assert.deepEqual(summary.membership.agents, {
      shrimpy: {},
      mechanic: {},
    });
    assert.equal(summary.lastMessage.preview, "hello home");
  });

  test("shows membership as JSON", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdChannels(["members", "home", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const membership = JSON.parse(lines.join("\n"));
    assert.equal(membership.channel, "home");
    assert.deepEqual(membership.agents, {
      shrimpy: {},
      mechanic: {},
    });
  });

  test("creates deterministic direct-message channels as JSON", async () => {
    await setupInit(workspace);
    await withMutedConsole(() => cmdAgent(["add", "helper"], { workspace } as any));
    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    const { result, lines } = await captureLogs(() =>
      cmdChannels(["dm", "shrimpy", "helper", "--json"], config as any)
    );

    assert.equal(result, 0);
    const membership = JSON.parse(lines.join("\n"));
    assert.equal(membership.channel, "dm~helper~shrimpy");
    assert.deepEqual(membership.agents, {
      helper: {},
      shrimpy: {},
    });
  });

  test("posts a CLI human message into a channel", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdChannels(["post", "home", "hello", "from", "cli"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.deepEqual(lines, ["posted to home"]);

    const channelBus = new ChannelBus(join(workspace, "channels"));
    const { messages } = channelBus.read("home");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.sender.kind, "human");
    assert.equal(messages[0]?.sender.actorId, "human:user:cli");
    assert.equal(messages[0]?.origin.transport, "cli");
    assert.equal(messages[0]?.origin.addressedAgentId, undefined);
    assert.equal(messages[0]?.content.type, "text");
    assert.equal(messages[0]?.content.type === "text" ? messages[0].content.data.text : "", "hello from cli");
  });

  test("posts an addressed CLI human message", async () => {
    await setupInit(workspace);
    await withMutedConsole(() => cmdAgent(["add", "career"], { workspace } as any));
    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    const { result, lines } = await captureLogs(() =>
      cmdChannels(
        ["post", "home", "--agent", "career", "please", "handle", "this", "--json"],
        config as any,
      )
    );

    assert.equal(result, 0);
    const posted = JSON.parse(lines.join("\n"));
    assert.equal(posted.channel, "home");
    assert.equal(posted.message.origin.addressedAgentId, "career");
    assert.equal(posted.message.content.data.text, "please handle this");
  });

  test("searches channel messages with agent-friendly filters", async () => {
    await setupInit(workspace);
    const channelBus = new ChannelBus(join(workspace, "channels"));
    channelBus.publish({
      channel: "home",
      id: "human-request",
      timestamp: Date.parse("2026-05-01T10:00:00.000Z"),
      sender: {
        kind: "human",
        actorId: "human:user:alice",
        userId: "user:alice",
        displayName: "alice",
      },
      origin: {
        transport: "cli",
        sourceChannel: "home",
      },
      content: textContent("please check the logs"),
    });
    channelBus.publish({
      channel: "home",
      id: "agent-reply",
      timestamp: Date.parse("2026-05-01T10:01:00.000Z"),
      sender: {
        kind: "agent",
        actorId: "shrimpy",
      },
      origin: {
        transport: "internal",
        sourceChannel: "home",
      },
      content: textContent("I checked them."),
    });

    const { result, lines } = await captureLogs(() =>
      cmdChannels(["search", "home", "check", "--kind", "user-text", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const payload = JSON.parse(lines.join("\n"));
    assert.equal(payload.channel, "home");
    assert.equal(payload.totalMessages, 2);
    assert.equal(payload.matchedCount, 1);
    assert.equal(payload.messages[0].id, "human-request");
    assert.equal(payload.messages[0].kind, "user_text");
    assert.equal(payload.messages[0].origin.transport, "cli");
  });

  test("search traces watch and system messages", async () => {
    await setupInit(workspace);
    const channelBus = new ChannelBus(join(workspace, "channels"));
    channelBus.publish({
      channel: "home",
      id: "watch-message",
      timestamp: Date.parse("2026-05-01T10:00:00.000Z"),
      sender: {
        kind: "system",
        actorId: "system:watch-runner",
      },
      origin: {
        transport: "watch",
        watchId: "shrimpy/maintenance",
        runId: "run-1",
        sourceChannel: "home",
        watch: {
          kind: "recurring",
          ownerAgentId: "shrimpy",
          localId: "maintenance",
          targetChannel: "home",
          inspect: ["shrimpy watches show shrimpy/maintenance"],
        },
      },
      content: textContent("watch maintenance"),
    });
    channelBus.publish({
      channel: "home",
      id: "maintenance-message",
      timestamp: Date.parse("2026-05-01T10:01:00.000Z"),
      sender: {
        kind: "system",
        actorId: "system:maintenance",
      },
      origin: {
        transport: "internal",
        sourceChannel: "home",
      },
      content: systemContent({ kind: "maintenance", note: "rotated logs" }),
    });

    const { result: watchResult, lines: watchLines } = await captureLogs(() =>
      cmdChannels(["search", "home", "--kind", "watch", "--watch", "shrimpy/maintenance", "--json"], { workspace } as any)
    );

    assert.equal(watchResult, 0);
    const watchPayload = JSON.parse(watchLines.join("\n"));
    assert.equal(watchPayload.matchedCount, 1);
    assert.equal(watchPayload.messages[0].id, "watch-message");
    assert.equal(watchPayload.messages[0].sourceId, "shrimpy/maintenance");
    assert.equal(watchPayload.messages[0].origin.runId, "run-1");
    assert.deepEqual(watchPayload.messages[0].inspectCommands, [
      "shrimpy watches show shrimpy/maintenance",
    ]);

    const { result: systemResult, lines: systemLines } = await captureLogs(() =>
      cmdChannels(["search", "home", "--kind", "system", "--json"], { workspace } as any)
    );

    assert.equal(systemResult, 0);
    const systemPayload = JSON.parse(systemLines.join("\n"));
    assert.equal(systemPayload.matchedCount, 1);
    assert.equal(systemPayload.messages[0].id, "maintenance-message");
    assert.equal(systemPayload.messages[0].kind, "system");
  });

  test("show includes channel activity summaries", async () => {
    await setupInit(workspace);
    const channelBus = new ChannelBus(join(workspace, "channels"));
    channelBus.publish({
      channel: "home",
      id: "human-request",
      timestamp: Date.parse("2026-05-01T10:00:00.000Z"),
      sender: {
        kind: "human",
        actorId: "human:user:alice",
        userId: "user:alice",
      },
      origin: {
        transport: "cli",
        sourceChannel: "home",
      },
      content: textContent("can you inspect this?"),
    });
    channelBus.publish({
      channel: "home",
      id: "watch-message",
      timestamp: Date.parse("2026-05-01T10:01:00.000Z"),
      sender: {
        kind: "system",
        actorId: "system:watch-runner",
      },
      origin: {
        transport: "watch",
        watchId: "shrimpy/maintenance",
        runId: "run-1",
        sourceChannel: "home",
        watch: {
          targetChannel: "home",
          inspect: ["shrimpy watches show shrimpy/maintenance"],
        },
      },
      content: textContent("watch check"),
    });

    const { result, lines } = await captureLogs(() =>
      cmdChannels(["show", "home", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.equal(summary.activity.kindCounts.user_text, 1);
    assert.equal(summary.activity.kindCounts.watch, 1);
    assert.deepEqual(
      summary.activity.recentRequests.map((message: any) => message.id),
      ["human-request"],
    );
    const watchRecord = summary.activity.sourceRecords.find(
      (record: any) => record.kind === "watch",
    );
    assert.ok(watchRecord);
    assert.equal(watchRecord.sourceId, "shrimpy/maintenance");
    assert.deepEqual(summary.activity.inspectCommands, [
      "shrimpy watches show shrimpy/maintenance",
    ]);
  });

  test("show bounds recent request summaries", async () => {
    await setupInit(workspace);
    const channelBus = new ChannelBus(join(workspace, "channels"));
    for (let i = 0; i < 6; i++) {
      channelBus.publish({
        channel: "home",
        id: `request-${i}`,
        timestamp: Date.parse("2026-05-01T10:00:00.000Z") + i,
        sender: {
          kind: "human",
          actorId: "human:user:alice",
        },
        origin: {
          transport: "cli",
          sourceChannel: "home",
        },
        content: textContent(`request ${i}`),
      });
    }

    const { result, lines } = await captureLogs(() =>
      cmdChannels(["show", "home", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summary = JSON.parse(lines.join("\n"));
    assert.deepEqual(
      summary.activity.recentRequests.map((message: any) => message.id),
      ["request-1", "request-2", "request-3", "request-4", "request-5"],
    );
  });
});
