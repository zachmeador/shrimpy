import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveAgentsConfig } from "../dist/config/agents.js";
import { buildAgentDmChannel } from "../dist/channels/index.js";
import {
  ChannelMembershipStore,
  defaultChannelMembers,
} from "../dist/channels/membership.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-channel-membership-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("defaultChannelMembers", () => {
  test("seeds home with shrimpy", () => {
    const agents = resolveAgentsConfig([
      { id: "shrimpy" },
      { id: "career" },
    ]);

    assert.deepEqual(defaultChannelMembers("home", agents), {
      agents: {
        shrimpy: {},
      },
    });
  });

  test("seeds direct-message channels from the channel name", () => {
    const agents = resolveAgentsConfig([
      { id: "shrimpy" },
      { id: "helper" },
      { id: "career" },
    ]);

    assert.deepEqual(
      defaultChannelMembers(buildAgentDmChannel("helper", "shrimpy"), agents),
      {
        agents: {
          helper: {},
          shrimpy: {},
        },
      },
    );
  });
});

describe("ChannelMembershipStore", () => {
  test("seeds surface-bound Telegram channels with the surface default agent", () => {
    const agents = resolveAgentsConfig([
      { id: "shrimpy" },
      { id: "helper" },
    ]);
    const path = join(workspace, "config", "channels.json");
    const store = new ChannelMembershipStore(path, agents, {
      defaultAgentIdsForChannel: (channel) =>
        channel.startsWith("telegram~helper~") ? ["helper"] : [],
    });

    assert.deepEqual(store.seedChannel("telegram~helper~123"), {
      agents: {
        helper: {},
      },
    });
  });

  test("does not infer room membership from agent definitions", () => {
    const agents = resolveAgentsConfig([
      { id: "shrimpy" },
      { id: "career" },
    ]);
    const path = join(workspace, "config", "channels.json");
    const store = new ChannelMembershipStore(path, agents);

    const membership = store.seedChannel("jobs-acme");

    assert.deepEqual(membership, {
      agents: {},
    });
  });

  test("seeds unmatched channels with no agent members", () => {
    const agents = resolveAgentsConfig([
      { id: "telegram" },
      { id: "discord" },
    ]);
    const path = join(workspace, "config", "channels.json");
    const store = new ChannelMembershipStore(path, agents);

    assert.deepEqual(store.seedChannel("slack-123"), {
      agents: {},
    });
  });

  test("refuses to remove shrimpy from home", () => {
    const agents = resolveAgentsConfig([
      { id: "shrimpy" },
    ]);
    const path = join(workspace, "config", "channels.json");
    const store = new ChannelMembershipStore(path, agents);

    store.seedChannel("home");
    assert.throws(() => store.removeAgent("home", "shrimpy"), /cannot remove shrimpy from home/);
  });

  test("removes an agent from all channel memberships", () => {
    const agents = resolveAgentsConfig([
      { id: "shrimpy" },
      { id: "career" },
    ]);
    const path = join(workspace, "config", "channels.json");
    const store = new ChannelMembershipStore(path, agents);

    store.seedChannel("home");
    store.addAgent("jobs-acme", "career");
    store.addAgent("home", "career");

    assert.deepEqual(store.removeAgentEverywhere("career"), ["home", "jobs-acme"]);
    assert.deepEqual(store.get("home"), {
      agents: {
        shrimpy: {},
      },
    });
    assert.deepEqual(store.get("jobs-acme"), {
      agents: {},
    });
  });

  test("renames an agent across all channel memberships", () => {
    const agents = resolveAgentsConfig([
      { id: "shrimpy" },
      { id: "career" },
    ]);
    const path = join(workspace, "config", "channels.json");
    const store = new ChannelMembershipStore(path, agents);

    store.seedChannel("home");
    store.addAgent("jobs-acme", "career");
    store.addAgent("home", "career");

    assert.deepEqual(store.renameAgentEverywhere("career", "jobs"), ["home", "jobs-acme"]);
    assert.deepEqual(store.get("home"), {
      agents: {
        jobs: {},
        shrimpy: {},
      },
    });
    assert.deepEqual(store.get("jobs-acme"), {
      agents: {
        jobs: {},
      },
    });
  });
});
