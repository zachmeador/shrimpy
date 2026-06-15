import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ChannelBus } from "../dist/channels/bus.js";
import {
  sessionResetContent,
  surfaceAddressingStatusContent,
  systemContent,
  textContent,
} from "../dist/channels/index.js";
import { cmdAgent } from "../dist/commands/agent.js";
import { cmdChannels } from "../dist/commands/channels.js";
import { UserPresenceStore } from "../dist/surfaces/shared/user-presence.js";
import {
  setupInit,
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

  test("lists channels as bounded JSON without activity blocks", async () => {
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
      cmdChannels(["--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const summaries = JSON.parse(lines.join("\n"));
    const home = summaries.find((summary: any) => summary.channel === "home");
    assert.ok(home);
    assert.equal(home.messageCount, 1);
    assert.equal(home.lastMessage.preview, "hello home");
    assert.equal(home.activity, undefined);
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

  test("rejects invalid channel names in create and post", async () => {
    await setupInit(workspace);

    await assert.rejects(
      () => cmdChannels(["create", "../outside"], { workspace } as any),
      /invalid channel name "\.\.\/outside"/,
    );
    await assert.rejects(
      () => cmdChannels(["post", "../outside", "hello"], { workspace } as any),
      /invalid channel name "\.\.\/outside"/,
    );
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

  test("posts to a user's last active surface channel by alias", async () => {
    await setupInit(workspace);
    new UserPresenceStore(join(workspace, "state", "user-presence.json")).record({
      userId: "alice",
      channel: "telegram~main~4242",
      surface: "telegram.main",
      transport: "telegram",
      transportChatId: "4242",
    });

    const { result, lines } = await captureLogs(() =>
      cmdChannels(["post", "user:alice", "hello", "alice", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const posted = JSON.parse(lines.join("\n"));
    assert.equal(posted.requestedChannel, "user:alice");
    assert.equal(posted.channel, "telegram~main~4242");

    const channelBus = new ChannelBus(join(workspace, "channels"));
    assert.equal(existsSync(join(workspace, "channels", "user:alice.jsonl")), false);
    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.content.type, "text");
    assert.equal(messages[0]?.content.type === "text" ? messages[0].content.data.text : "", "hello alice");
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

  test("clips plain channel reads unless --full is passed", async () => {
    await setupInit(workspace);
    const channelBus = new ChannelBus(join(workspace, "channels"));
    const longText = `start ${"x".repeat(500)} end`;
    channelBus.publish({
      channel: "home",
      id: "long-message",
      timestamp: Date.parse("2026-05-01T10:00:00.000Z"),
      sender: {
        kind: "human",
        actorId: "human:user:alice",
      },
      origin: {
        transport: "cli",
        sourceChannel: "home",
      },
      content: textContent(longText),
    });

    const clipped = await captureLogs(() =>
      cmdChannels(["read", "home", "--limit", "1"], { workspace } as any)
    );
    const full = await captureLogs(() =>
      cmdChannels(["read", "home", "--limit", "1", "--full"], { workspace } as any)
    );
    const json = await captureLogs(() =>
      cmdChannels(["read", "home", "--limit", "1", "--json"], { workspace } as any)
    );

    assert.equal(clipped.result, 0);
    assert.match(clipped.lines.join("\n"), /\[truncated; use --full\]/);
    assert.equal(clipped.lines.join("\n").includes(longText), false);
    assert.equal(full.result, 0);
    assert.equal(full.lines.join("\n").includes(longText), true);
    assert.doesNotMatch(full.lines.join("\n"), /\[truncated; use --full\]/);
    assert.equal(json.result, 0);
    assert.equal(JSON.parse(json.lines.join("\n"))[0].content.data.text, longText);
  });

  test("clips plain channel search previews unless --full is passed", async () => {
    await setupInit(workspace);
    const channelBus = new ChannelBus(join(workspace, "channels"));
    const longText = `start ${"x".repeat(500)} needle end`;
    channelBus.publish({
      channel: "home",
      id: "search-long-message",
      timestamp: Date.parse("2026-05-01T10:00:00.000Z"),
      sender: {
        kind: "human",
        actorId: "human:user:alice",
      },
      origin: {
        transport: "cli",
        sourceChannel: "home",
      },
      content: textContent(longText),
    });

    const clipped = await captureLogs(() =>
      cmdChannels(["search", "home", "needle"], { workspace } as any)
    );
    const full = await captureLogs(() =>
      cmdChannels(["search", "home", "needle", "--full"], { workspace } as any)
    );

    assert.equal(clipped.result, 0);
    assert.match(clipped.lines.join("\n"), /\[truncated; use --full\]/);
    assert.equal(clipped.lines.join("\n").includes(longText), false);
    assert.match(clipped.lines.join("\n"), /1\/1 matches/);
    assert.equal(full.result, 0);
    assert.equal(full.lines.join("\n").includes(longText), true);
    assert.doesNotMatch(full.lines.join("\n"), /\[truncated; use --full\]/);
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

  test("search filters typed control and status messages", async () => {
    await setupInit(workspace);
    const channelBus = new ChannelBus(join(workspace, "channels"));
    channelBus.publish({
      channel: "home",
      id: "reset-control",
      timestamp: Date.parse("2026-05-01T10:00:00.000Z"),
      sender: {
        kind: "human",
        actorId: "human:user:alice",
      },
      origin: {
        transport: "cli",
        sourceChannel: "home",
      },
      content: sessionResetContent("shrimpy", "/new"),
    });
    channelBus.publish({
      channel: "home",
      id: "addressing-status",
      timestamp: Date.parse("2026-05-01T10:01:00.000Z"),
      sender: {
        kind: "system",
        actorId: "system:surface",
      },
      origin: {
        transport: "internal",
        sourceChannel: "home",
      },
      content: surfaceAddressingStatusContent({
        surface: "telegram.main",
        threadId: "4242",
        previousAgentId: null,
        addressedAgentId: "shrimpy",
        joinedAgentId: null,
        source: "cli",
      }),
    });

    const { result: controlResult, lines: controlLines } = await captureLogs(() =>
      cmdChannels(["search", "home", "--kind", "control", "--json"], { workspace } as any)
    );
    assert.equal(controlResult, 0);
    const controlPayload = JSON.parse(controlLines.join("\n"));
    assert.equal(controlPayload.matchedCount, 1);
    assert.equal(controlPayload.messages[0].id, "reset-control");
    assert.equal(controlPayload.messages[0].kind, "control");
    assert.equal(controlPayload.messages[0].contentType, "control");

    const { result: statusResult, lines: statusLines } = await captureLogs(() =>
      cmdChannels(["search", "home", "--kind", "status", "--json"], { workspace } as any)
    );
    assert.equal(statusResult, 0);
    const statusPayload = JSON.parse(statusLines.join("\n"));
    assert.equal(statusPayload.matchedCount, 1);
    assert.equal(statusPayload.messages[0].id, "addressing-status");
    assert.equal(statusPayload.messages[0].kind, "status");
    assert.equal(statusPayload.messages[0].contentType, "status");
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
