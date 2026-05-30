import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelBus } from "../dist/channels/bus.js";
import { cmdAgent } from "../dist/commands/agent.js";
import { cmdChannels } from "../dist/commands/channels.js";
import { setupInit } from "../dist/setup.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-channels-command-test-"));
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
});
