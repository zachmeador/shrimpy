import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ChannelBus } from "../dist/channels/bus.js";
import { ChannelMembershipStore } from "../dist/channels/membership.js";
import { cmdSurface } from "../dist/commands/surface.js";
import { resolveAgentsConfig } from "../dist/config/agents.js";
import {
  setupInit,
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-surface-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("cmdSurface", () => {
  test("lists surface state as JSON", async () => {
    await setupInit(workspace);
    await captureLogs(() =>
      cmdSurface(["set-agent", "telegram", "4242", "shrimpy"], { workspace } as any)
    );

    const { result, lines } = await captureLogs(() =>
      cmdSurface(["--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.deepEqual(JSON.parse(lines.join("\n")), [
      { surface: "telegram", threadId: "4242", addressedAgentId: "shrimpy" },
    ]);
  });

  test("returns structured state changes for set and clear", async () => {
    await setupInit(workspace);

    const setResult = await captureLogs(() =>
      cmdSurface(["set-agent", "telegram", "4242", "shrimpy", "--json"], { workspace } as any)
    );
    assert.equal(setResult.result, 0);
    assert.deepEqual(JSON.parse(setResult.lines.join("\n")), {
      surface: "telegram",
      threadId: "4242",
      addressedAgentId: "shrimpy",
      channel: null,
      joinedAgentId: null,
    });

    const clearResult = await captureLogs(() =>
      cmdSurface(["clear-agent", "telegram", "4242", "--json"], { workspace } as any)
    );
    assert.equal(clearResult.result, 0);
    assert.deepEqual(JSON.parse(clearResult.lines.join("\n")), {
      surface: "telegram",
      threadId: "4242",
      addressedAgentId: null,
      channel: null,
    });
  });

  test("set-agent joins the agent and publishes a non-waking status on routed surface threads", async () => {
    await setupInit(workspace);
    const config = {
      workspace,
      agents: [
        { id: "shrimpy" },
        { id: "mechanic" },
      ],
      telegram: {
        instances: {
          main: {
            token: "test-token",
            defaultAgentId: "shrimpy",
            allowedChatIds: [4242],
          },
        },
      },
    };

    const setResult = await captureLogs(() =>
      cmdSurface(["set-agent", "telegram.main", "4242", "mechanic", "--json"], config as any)
    );

    assert.equal(setResult.result, 0);
    assert.deepEqual(JSON.parse(setResult.lines.join("\n")), {
      surface: "telegram.main",
      threadId: "4242",
      addressedAgentId: "mechanic",
      channel: "telegram~main~4242",
      joinedAgentId: "mechanic",
    });

    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      resolveAgentsConfig(),
    );
    assert.deepEqual(memberships.listAgentIds("telegram~main~4242"), [
      "mechanic",
      "shrimpy",
    ]);

    const channelBus = new ChannelBus(join(workspace, "channels"));
    const { messages } = channelBus.read("telegram~main~4242");
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].content, {
      type: "status",
      data: {
        kind: "surface_addressing",
        surface: "telegram.main",
        threadId: "4242",
        previousAgentId: null,
        addressedAgentId: "mechanic",
        joinedAgentId: "mechanic",
        source: "cli",
      },
    });
  });

  test("reports when no surface activity route matches a channel", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdSurface(["activity", "local", "--duration", "0", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.deepEqual(JSON.parse(lines.join("\n")), {
      channel: "local",
      kind: "typing",
      started: false,
      durationSeconds: 0,
    });
  });
});
