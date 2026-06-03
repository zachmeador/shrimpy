import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveAgentChannelPolicy,
  resolveAgentsConfig,
} from "../dist/config/agents.js";
import {
  evaluateAgentChannelPolicy,
  extractMentionedAgentIds,
  shouldAgentWakeForChannelMessage,
} from "../dist/agents/channel-policy.js";
import { ChannelMembershipStore } from "../dist/channels/membership.js";
import {
  ChannelDeliveryLoop,
  shouldDispatchBacklogMessage,
} from "../dist/delivery/channel-delivery-loop.js";
import { SessionControlRuntime } from "../dist/delivery/session-control-runtime.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-delivery-loop-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("shouldDispatchBacklogMessage", () => {
  test("replays human backlog messages", () => {
    assert.equal(
      shouldDispatchBacklogMessage({
        id: "human",
        sender: { kind: "human", actorId: "human:test" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "hello" } },
        timestamp: Date.now(),
      }),
      true,
    );
  });

  test("skips scheduler/system backlog messages", () => {
    assert.equal(
      shouldDispatchBacklogMessage({
        id: "system",
        sender: { kind: "system", actorId: "system:scheduler" },
        origin: { transport: "scheduler" },
        content: { type: "system", data: { trigger: "scheduled" } },
        timestamp: Date.now(),
      }),
      false,
    );
  });

  test("replays non-scheduler system backlog messages", () => {
    assert.equal(
      shouldDispatchBacklogMessage({
        id: "system-cli",
        sender: { kind: "system", actorId: "system:cli" },
        origin: { transport: "cli" },
        content: { type: "system", data: { kind: "agent_added", agentId: "career" } },
        timestamp: Date.now(),
      }),
      true,
    );
  });

  test("replays agent backlog messages", () => {
    assert.equal(
      shouldDispatchBacklogMessage({
        id: "agent",
        sender: { kind: "agent", actorId: "agent:shrimpy" },
        origin: { transport: "internal" },
        content: { type: "text", data: { text: "reply" } },
        timestamp: Date.now(),
      }),
      true,
    );
  });

  test("replays session reset control backlog messages", () => {
    assert.equal(
      shouldDispatchBacklogMessage({
        id: "reset",
        sender: { kind: "system", actorId: "system:cli" },
        origin: { transport: "cli" },
        content: {
          type: "system",
          data: {
            kind: "session_reset",
            targetAgentId: "shrimpy",
            command: "/new",
          },
        },
        timestamp: Date.now(),
      }),
      true,
    );
  });

  test("replays session restore control backlog messages", () => {
    assert.equal(
      shouldDispatchBacklogMessage({
        id: "restore",
        sender: { kind: "system", actorId: "system:cli" },
        origin: { transport: "cli" },
        content: {
          type: "system",
          data: {
            kind: "session_restore",
            targetAgentId: "shrimpy",
            archiveName: "telegram-1-1234567890",
            command: "/restore",
          },
        },
        timestamp: Date.now(),
      }),
      true,
    );
  });

  test("replays session thinking control backlog messages", () => {
    assert.equal(
      shouldDispatchBacklogMessage({
        id: "thinking",
        sender: { kind: "system", actorId: "system:cli" },
        origin: { transport: "cli" },
        content: {
          type: "system",
          data: {
            kind: "session_thinking_level",
            targetAgentId: "shrimpy",
            level: "high",
            command: "/thinking",
          },
        },
        timestamp: Date.now(),
      }),
      true,
    );
  });
});

describe("agent channel policy", () => {
  function agent(id: string, channelPolicy?: Parameters<typeof resolveAgentChannelPolicy>[0]) {
    return { id, channelPolicy: resolveAgentChannelPolicy(channelPolicy) };
  }

  test("wakes for visible human messages by default", () => {
    assert.equal(
      shouldAgentWakeForChannelMessage(agent("shrimpy"), "home", {
        id: "human-1",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "hello" } },
        timestamp: Date.now(),
      }, { visible: true }),
      true,
    );
  });

  test("suppresses self-authored agent messages", () => {
    assert.equal(
      shouldAgentWakeForChannelMessage(agent("career"), "home", {
        id: "agent-1",
        sender: { kind: "agent", actorId: "agent:career" },
        origin: { transport: "internal" },
        content: { type: "text", data: { text: "note" } },
        timestamp: Date.now(),
      }, { visible: true }),
      false,
    );
  });

  test("uses addressed-agent metadata as an agent policy input", () => {
    assert.equal(
      shouldAgentWakeForChannelMessage(agent("career"), "home", {
        id: "human-2",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram", addressedAgentId: "career" },
        content: { type: "text", data: { text: "hello" } },
        timestamp: Date.now(),
      }, { visible: true }),
      true,
    );

    assert.equal(
      shouldAgentWakeForChannelMessage(agent("shrimpy"), "home", {
        id: "human-3",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram", addressedAgentId: "career" },
        content: { type: "text", data: { text: "hello" } },
        timestamp: Date.now(),
      }, { visible: true }),
      false,
    );
  });

  test("agent policy accepts addressed system messages for the targeted visible agent", () => {
    const message = {
      id: "system-1",
      sender: { kind: "system" as const, actorId: "system:cli" },
      origin: { transport: "cli", addressedAgentId: "career" },
      content: {
        type: "system" as const,
        data: { kind: "agent_updated", agentId: "career" },
      },
      timestamp: Date.now(),
    };

    assert.equal(
      shouldAgentWakeForChannelMessage(agent("career"), "home", message, { visible: true }),
      true,
    );
    assert.equal(
      shouldAgentWakeForChannelMessage(agent("shrimpy"), "home", message, { visible: true }),
      false,
    );
  });

  test("lets all-mode channel members handle unaddressed messages", () => {
    assert.equal(
      shouldAgentWakeForChannelMessage(agent("career"), "home", {
        id: "human-4",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "just chatting" } },
        timestamp: Date.now(),
      }, { visible: true }),
      true,
    );

    assert.equal(
      shouldAgentWakeForChannelMessage(agent("career"), "home", {
        id: "human-5",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "@career please jump in" } },
        timestamp: Date.now(),
      }, { visible: true }),
      true,
    );

    assert.equal(
      shouldAgentWakeForChannelMessage(agent("career"), "home", {
        id: "human-6",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram", addressedAgentId: "shrimpy" },
        content: { type: "text", data: { text: "hello shrimpy" } },
        timestamp: Date.now(),
      }, { visible: true }),
      false,
    );
  });

  test("supports mention-only and channel-specific policy", () => {
    const career = agent("career", {
      mode: "mentions",
      channels: {
        "team-*": { mode: "all", senders: ["human"] },
      },
    });

    assert.equal(
      shouldAgentWakeForChannelMessage(career, "home", {
        id: "human-7",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "anyone around?" } },
        timestamp: Date.now(),
      }, { visible: true }),
      false,
    );
    assert.equal(
      shouldAgentWakeForChannelMessage(career, "home", {
        id: "human-8",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "@career around?" } },
        timestamp: Date.now(),
      }, { visible: true }),
      true,
    );
    assert.equal(
      shouldAgentWakeForChannelMessage(career, "team-ops", {
        id: "human-9",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "standup" } },
        timestamp: Date.now(),
      }, { visible: true }),
      true,
    );
  });

  test("none mode ignores mentions and addressed mode ignores multi-agent mentions", () => {
    assert.equal(
      shouldAgentWakeForChannelMessage(agent("career", { mode: "none" }), "home", {
        id: "human-10",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "@career can you take this?" } },
        timestamp: Date.now(),
      }, { visible: true }),
      false,
    );

    assert.equal(
      shouldAgentWakeForChannelMessage(agent("career", { mode: "addressed" }), "home", {
        id: "human-11",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "@career and @music can you coordinate?" } },
        timestamp: Date.now(),
      }, { visible: true }),
      false,
    );
  });
});

describe("targeting helpers", () => {
  test("detects explicit single-target mentions", () => {
    assert.deepEqual(
      extractMentionedAgentIds({
        id: "human-7",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "@career take this" } },
        timestamp: Date.now(),
      }),
      ["career"],
    );

    const decision = evaluateAgentChannelPolicy({
      id: "career",
      channelPolicy: resolveAgentChannelPolicy({ mode: "mentions" }),
    }, "home", {
      id: "human-8",
      sender: { kind: "human", actorId: "human:alice" },
      origin: { transport: "telegram" },
      content: { type: "text", data: { text: "@career and @music both look" } },
      timestamp: Date.now(),
    }, { visible: true });
    assert.equal(decision.action, "ignore");
  });
});

function testAgents() {
  return resolveAgentsConfig([
    { id: "shrimpy", model: { provider: "test", id: "shrimpy-model" } },
    { id: "career", model: { provider: "test", id: "career-model" } },
  ]);
}

function testBootstraps(agents: ReturnType<typeof resolveAgentsConfig>) {
  return new Map(
    agents.map((agent) => [
      agent.id,
      {
        workspacePath: workspace,
        agentRootPath: join(workspace, "agents", agent.id),
        modelsPath: join(workspace, "state", "pi", "models.json"),
        modelRegistry: {
          find(provider: string, id: string) {
            return provider === "test"
              ? { provider, id, contextWindow: 1000 }
              : undefined;
          },
          getAvailable() {
            return agents.map((agent) => ({
              provider: "test",
              id: agent.model?.id ?? `${agent.id}-model`,
              contextWindow: 1000,
            }));
          },
        },
      },
    ]),
  ) as any;
}

describe("ChannelDeliveryLoop routing", () => {
  test("fans out human messages to all agent members in the channel", async () => {
    const agents = testAgents();
    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      agents,
    );
    memberships.write({
      channels: {
        "room-1": {
          agents: {
            shrimpy: {},
            career: {},
          },
        },
      },
    });

    const runtime = {
      resolved: {
        agents,
        sessions: undefined,
      },
      createChannelMembershipStore() {
        return memberships;
      },
      getAgent(agentId: string) {
        return agents.find((agent) => agent.id === agentId) ?? agents[0];
      },
      buildRuntimeTools() {
        return [];
      },
      paths: {
        cursorsPath: join(workspace, "cursors.json"),
      },
    } as any;

    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {} as any,
    }) as any;

    const calls: Array<{ agentId: string; channel: string; actorId: string }> = [];
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", {
        handleMessage: async (channel: string, message: any) => {
          calls.push({ agentId: "shrimpy", channel, actorId: message.sender.actorId });
        },
      }],
      ["career", {
        handleMessage: async (channel: string, message: any) => {
          calls.push({ agentId: "career", channel, actorId: message.sender.actorId });
        },
      }],
    ]);

    await dispatcher.dispatchMessage("room-1", {
      id: "human-1",
      sender: { kind: "human", actorId: "human:alice" },
      origin: { transport: "telegram" },
      content: { type: "text", data: { text: "hello" } },
      timestamp: Date.now(),
    }, "live");

    assert.deepEqual(calls.map((call) => call.agentId), ["career", "shrimpy"]);
  });

  test("offers unaddressed messages to subscribed agents", async () => {
    const agents = testAgents();
    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      agents,
    );
    memberships.write({
      channels: {
        "group-1": {
          agents: {
            shrimpy: {},
            career: {},
          },
        },
      },
    });

    const runtime = {
      resolved: {
        agents,
        sessions: undefined,
      },
      createChannelMembershipStore() {
        return memberships;
      },
      getAgent(agentId: string) {
        return agents.find((agent) => agent.id === agentId) ?? agents[0];
      },
      buildRuntimeTools() {
        return [];
      },
      paths: {
        cursorsPath: join(workspace, "cursors.json"),
      },
    } as any;

    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {} as any,
    }) as any;

    const calls: string[] = [];
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", { handleMessage: async () => calls.push("shrimpy") }],
      ["career", { handleMessage: async () => calls.push("career") }],
    ]);

    await dispatcher.dispatchMessage("group-1", {
      id: "human-friend",
      sender: { kind: "human", actorId: "human:user:friend", userId: "user:friend" },
      origin: { transport: "telegram" },
      content: { type: "text", data: { text: "hello" } },
      timestamp: Date.now(),
    }, "live");

    assert.deepEqual(calls, ["career", "shrimpy"]);
  });

  test("routes Scrappy-style scheduled messages through channel membership and agent channel policy", async () => {
    const agents = resolveAgentsConfig([
      {
        id: "shrimpy",
        model: { provider: "test", id: "shrimpy-model" },
        channelPolicy: { mode: "all", senders: ["human"] },
      },
      {
        id: "ole_scrappy",
        model: { provider: "test", id: "scrappy-model" },
        channelPolicy: {
          mode: "none",
          channels: {
            "telegram~main~4242": {
              mode: "all",
              senders: ["system"],
              actorIds: ["system:scheduler"],
            },
          },
        },
      },
    ]);
    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      agents,
    );
    memberships.write({
      channels: {
        "telegram~main~4242": {
          agents: {
            shrimpy: {},
            ole_scrappy: {},
          },
        },
      },
    });

    const runtime = {
      resolved: {
        agents,
        sessions: undefined,
      },
      createChannelMembershipStore() {
        return memberships;
      },
      getAgent(agentId: string) {
        return agents.find((agent) => agent.id === agentId) ?? agents[0];
      },
      buildRuntimeTools() {
        return [];
      },
      paths: {
        cursorsPath: join(workspace, "cursors.json"),
      },
    } as any;

    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {} as any,
    }) as any;

    const calls: string[] = [];
    dispatcher.agentRuntimes = new Map(agents.map((agent) => [
      agent.id,
      {
        handleMessage: async (channel: string, message: any) => {
          if (shouldAgentWakeForChannelMessage(agent, channel, message, { visible: true })) {
            calls.push(agent.id);
          }
        },
      },
    ]));

    await dispatcher.dispatchMessage("telegram~main~4242", {
      id: "scrappy-schedule",
      sender: { kind: "system", actorId: "system:scheduler" },
      origin: {
        transport: "scheduler",
        scheduleId: "ole_scrappy/morning-letter",
        runId: "run-1",
        sourceChannel: "telegram~main~4242",
        schedule: {
          ownerAgentId: "ole_scrappy",
          localId: "morning-letter",
          targetChannel: "telegram~main~4242",
          inspect: ["shrimpy schedules show ole_scrappy/morning-letter"],
        },
      },
      content: {
        type: "text",
        data: { text: "Write a morning letter in character." },
      },
      timestamp: Date.now(),
    }, "live");

    assert.deepEqual(calls, ["ole_scrappy"]);
  });

  test("uses empty bootstrap membership when a channel has no explicit membership yet", async () => {
    const agents = testAgents();
    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      agents,
    );

    const runtime = {
      resolved: {
        agents,
        sessions: undefined,
      },
      createChannelMembershipStore() {
        return memberships;
      },
      getAgent(agentId: string) {
        return agents.find((agent) => agent.id === agentId) ?? agents[0];
      },
      buildRuntimeTools() {
        return [];
      },
      paths: {
        cursorsPath: join(workspace, "cursors.json"),
      },
    } as any;

    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {} as any,
    }) as any;

    const calls: string[] = [];
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", { handleMessage: async () => calls.push("shrimpy") }],
      ["career", { handleMessage: async () => calls.push("career") }],
    ]);

    await dispatcher.dispatchMessage("room-1", {
      id: "human-2",
      sender: { kind: "human", actorId: "human:alice" },
      origin: { transport: "telegram" },
      content: { type: "text", data: { text: "hello" } },
      timestamp: Date.now(),
    }, "live");

    assert.deepEqual(calls, []);
    assert.deepEqual(memberships.get("room-1")?.agents, {});
  });

  test("does not dispatch explicitly addressed turns to non-member agents", async () => {
    const agents = testAgents();
    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      agents,
      {
        defaultAgentIdsForChannel: (channel) =>
          channel.startsWith("telegram~main~") ? ["shrimpy"] : [],
      },
    );
    memberships.seedChannel("telegram~main~4242");

    const runtime = {
      resolved: {
        agents,
        sessions: undefined,
      },
      createChannelMembershipStore() {
        return memberships;
      },
      getAgent(agentId: string) {
        return agents.find((agent) => agent.id === agentId) ?? agents[0];
      },
      buildRuntimeTools() {
        return [];
      },
      paths: {
        cursorsPath: join(workspace, "cursors.json"),
      },
    } as any;

    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {} as any,
    }) as any;

    const calls: string[] = [];
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", {
        handleMessage: async (_channel: string, message: any) => {
          if (shouldAgentWakeForChannelMessage(
            agents.find((agent) => agent.id === "shrimpy")!,
            _channel,
            message,
            { visible: true },
          )) {
            calls.push("shrimpy");
          }
        },
      }],
      ["career", {
        handleMessage: async (_channel: string, message: any) => {
          if (shouldAgentWakeForChannelMessage(
            agents.find((agent) => agent.id === "career")!,
            _channel,
            message,
            { visible: true },
          )) {
            calls.push("career");
          }
        },
      }],
    ]);

    await dispatcher.dispatchMessage("telegram~main~4242", {
      id: "human-addressed",
      sender: { kind: "human", actorId: "human:alice" },
      origin: { transport: "telegram", addressedAgentId: "career" },
      content: { type: "text", data: { text: "hello" } },
      timestamp: Date.now(),
    }, "live");

    assert.deepEqual(calls, []);
    assert.deepEqual(memberships.get("telegram~main~4242")?.agents, {
      shrimpy: {},
    });
  });

  test("intercepts session reset control messages and resets only the target agent", async () => {
    const agents = testAgents();
    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      agents,
    );
    memberships.seedChannel("room-1");
    memberships.addAgent("room-1", "shrimpy");
    memberships.addAgent("room-1", "career");

    const delivered: Array<{ channel: string; text: string }> = [];
    const runtime = {
      resolved: {
        agents,
        sessions: undefined,
      },
      createChannelMembershipStore() {
        return memberships;
      },
      getAgent(agentId: string) {
        return agents.find((agent) => agent.id === agentId) ?? agents[0];
      },
      buildRuntimeTools() {
        return [];
      },
      paths: {
        cursorsPath: join(workspace, "cursors.json"),
      },
    } as any;

    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {
        async deliverText(channel: string, text: string) {
          delivered.push({ channel, text });
          return true;
        },
      } as any,
    }) as any;

    const calls: string[] = [];
    const resets: string[] = [];
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", {
        async handleMessage() {
          calls.push("shrimpy");
        },
        async reset(channel: string) {
          resets.push(`shrimpy:${channel}`);
        },
      }],
      ["career", {
        async handleMessage() {
          calls.push("career");
        },
        async reset(channel: string) {
          resets.push(`career:${channel}`);
        },
      }],
    ]);
    dispatcher.controlRuntime = new SessionControlRuntime(
      dispatcher.channelBus,
      dispatcher.agentRuntimes,
    );

    await dispatcher.dispatchMessage("room-1", {
      id: "reset-1",
      sender: { kind: "human", actorId: "human:alice" },
      origin: { transport: "telegram" },
      content: {
        type: "system",
        data: {
          kind: "session_reset",
          targetAgentId: "career",
          command: "/new",
        },
      },
      timestamp: Date.now(),
    }, "live");

    assert.deepEqual(calls, []);
    assert.deepEqual(resets, ["career:room-1"]);
    assert.deepEqual(delivered, [{
      channel: "room-1",
      text: "Started a new session for career.",
    }]);
  });

  test("intercepts session restore control messages and restores only the target agent", async () => {
    const agents = testAgents();
    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      agents,
    );
    memberships.seedChannel("room-1");
    memberships.addAgent("room-1", "shrimpy");
    memberships.addAgent("room-1", "career");

    const delivered: Array<{ channel: string; text: string }> = [];
    const runtime = {
      resolved: {
        agents,
        sessions: undefined,
      },
      createChannelMembershipStore() {
        return memberships;
      },
      getAgent(agentId: string) {
        return agents.find((agent) => agent.id === agentId) ?? agents[0];
      },
      buildRuntimeTools() {
        return [];
      },
      paths: {
        cursorsPath: join(workspace, "cursors.json"),
      },
    } as any;

    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {
        async deliverText(channel: string, text: string) {
          delivered.push({ channel, text });
          return true;
        },
      } as any,
    }) as any;

    const calls: string[] = [];
    const restores: string[] = [];
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", {
        async handleMessage() {
          calls.push("shrimpy");
        },
        async restore(channel: string, archiveName?: string) {
          restores.push(`shrimpy:${channel}:${archiveName ?? ""}`);
          return { restoredFrom: "ignored" };
        },
      }],
      ["career", {
        async handleMessage() {
          calls.push("career");
        },
        async restore(channel: string, archiveName?: string) {
          restores.push(`career:${channel}:${archiveName ?? ""}`);
          return { restoredFrom: "/tmp/archive-career" };
        },
      }],
    ]);
    dispatcher.controlRuntime = new SessionControlRuntime(
      dispatcher.channelBus,
      dispatcher.agentRuntimes,
    );

    await dispatcher.dispatchMessage("room-1", {
      id: "restore-1",
      sender: { kind: "human", actorId: "human:alice" },
      origin: { transport: "telegram" },
      content: {
        type: "system",
        data: {
          kind: "session_restore",
          targetAgentId: "career",
          archiveName: "career-room-1-123",
          command: "/restore",
        },
      },
      timestamp: Date.now(),
    }, "live");

    assert.deepEqual(calls, []);
    assert.deepEqual(restores, ["career:room-1:career-room-1-123"]);
    assert.deepEqual(delivered, [{
      channel: "room-1",
      text: "Restored session for career from /tmp/archive-career.",
    }]);
  });

  test("intercepts session thinking control messages and updates only the target agent", async () => {
    const agents = testAgents();
    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      agents,
    );
    memberships.seedChannel("room-1");
    memberships.addAgent("room-1", "shrimpy");
    memberships.addAgent("room-1", "career");

    const delivered: Array<{ channel: string; text: string }> = [];
    const runtime = {
      resolved: {
        agents,
        sessions: undefined,
      },
      createChannelMembershipStore() {
        return memberships;
      },
      getAgent(agentId: string) {
        return agents.find((agent) => agent.id === agentId) ?? agents[0];
      },
      buildRuntimeTools() {
        return [];
      },
      paths: {
        cursorsPath: join(workspace, "cursors.json"),
      },
    } as any;

    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {
        async deliverText(channel: string, text: string) {
          delivered.push({ channel, text });
          return true;
        },
      } as any,
    }) as any;

    const calls: string[] = [];
    const changes: string[] = [];
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", {
        async handleMessage() {
          calls.push("shrimpy");
        },
        async setThinkingLevel(channel: string, level: string) {
          changes.push(`shrimpy:${channel}:${level}`);
          return { requestedLevel: level, effectiveLevel: level };
        },
      }],
      ["career", {
        async handleMessage() {
          calls.push("career");
        },
        async setThinkingLevel(channel: string, level: string) {
          changes.push(`career:${channel}:${level}`);
          return { requestedLevel: level, effectiveLevel: "off" };
        },
      }],
    ]);
    dispatcher.controlRuntime = new SessionControlRuntime(
      dispatcher.channelBus,
      dispatcher.agentRuntimes,
    );

    await dispatcher.dispatchMessage("room-1", {
      id: "thinking-1",
      sender: { kind: "human", actorId: "human:alice" },
      origin: { transport: "telegram" },
      content: {
        type: "system",
        data: {
          kind: "session_thinking_level",
          targetAgentId: "career",
          level: "high",
          command: "/thinking",
        },
      },
      timestamp: Date.now(),
    }, "live");

    assert.deepEqual(calls, []);
    assert.deepEqual(changes, ["career:room-1:high"]);
    assert.deepEqual(delivered, [{
      channel: "room-1",
      text: "Set thinking level for career to off (requested high).",
    }]);
  });
});
