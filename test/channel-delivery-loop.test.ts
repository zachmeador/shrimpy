import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
} from "../dist/gateway/channel-delivery-loop.js";
import { SessionControlRuntime } from "../dist/gateway/session-control-runtime.js";
import { loadGatewayRuntimeState } from "../dist/gateway/runtime-state.js";

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

  test("skips watch/system backlog messages", () => {
    assert.equal(
      shouldDispatchBacklogMessage({
        id: "system",
        sender: { kind: "system", actorId: "system:watch-runner" },
        origin: { transport: "watch" },
        content: { type: "system", data: { trigger: "watch" } },
        timestamp: Date.now(),
      }),
      false,
    );
  });

  test("replays non-generated system backlog messages", () => {
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
          type: "control",
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
          type: "control",
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
          type: "control",
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

  test("replays session stop control backlog messages", () => {
    assert.equal(
      shouldDispatchBacklogMessage({
        id: "stop",
        sender: { kind: "system", actorId: "system:cli" },
        origin: { transport: "cli" },
        content: {
          type: "control",
          data: {
            kind: "session_stop",
            targetAgentId: "shrimpy",
            command: "/stop",
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
    const decision = evaluateAgentChannelPolicy(agent("career"), "home", {
      id: "agent-1",
      sender: { kind: "agent", actorId: "agent:career" },
      origin: { transport: "internal" },
      content: { type: "text", data: { text: "note" } },
      timestamp: Date.now(),
    }, { visible: true });

    assert.equal(decision.action, "ignore");
    assert.equal(decision.reason, "self-authored channel message");
    assert.equal(decision.runtimeGuard, undefined);
  });

  test("suppresses unaddressed agent-to-agent wakes unless the policy opts in", () => {
    const message = {
      id: "agent-2",
      sender: { kind: "agent" as const, actorId: "agent:shrimpy" },
      origin: { transport: "internal" },
      content: { type: "text" as const, data: { text: "note" } },
      timestamp: Date.now(),
    };

    const defaultDecision = evaluateAgentChannelPolicy(
      agent("career"),
      "home",
      message,
      { visible: true },
    );
    assert.equal(defaultDecision.action, "ignore");
    assert.equal(defaultDecision.runtimeGuard, "agent-to-agent wake loop guard");

    assert.equal(
      shouldAgentWakeForChannelMessage(
        agent("career", { mode: "all", senders: ["agent"] }),
        "home",
        message,
        { visible: true },
      ),
      true,
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

  test("ignores surface addressing status messages", () => {
    const decision = evaluateAgentChannelPolicy(agent("career"), "telegram~main~4242", {
      id: "surface-addressing-1",
      sender: { kind: "system", actorId: "system:surface" },
      origin: { transport: "chat" },
      content: {
        type: "status",
        data: {
          kind: "surface_addressing",
          surface: "telegram.main",
          threadId: "4242",
          previousAgentId: "shrimpy",
          addressedAgentId: "career",
          joinedAgentId: "career",
          source: "chat",
        },
      },
      timestamp: Date.now(),
    }, { visible: true });

    assert.equal(decision.action, "ignore");
    assert.equal(decision.runtimeGuard, undefined);
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

describe("gateway runtime state", () => {
  test("filters historical expected non-reportable loop guard trips", () => {
    const statePath = join(workspace, "gateway-state.json");
    writeFileSync(statePath, JSON.stringify({
      version: 1,
      updatedAt: 1,
      handled: {},
      lanes: {},
      loopGuards: [
        {
          agentId: "shrimpy",
          channel: "home",
          messageId: "self-authored-1",
          reason: "self-authored agent messages are not re-offered to the same agent",
          at: 1_000,
        },
        {
          agentId: "career",
          channel: "home",
          messageId: "surface-status-1",
          reason: "surface addressing status messages do not wake agents",
          at: 2_000,
        },
        {
          agentId: "career",
          channel: "home",
          messageId: "agent-loop-1",
          reason: "agent-to-agent wake loop guard",
          at: 3_000,
        },
      ],
    }));

    const state = loadGatewayRuntimeState(statePath);

    assert.deepEqual(state.loopGuards.map((trip) => trip.messageId), ["agent-loop-1"]);
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
    { id: "shrimpy", modelPolicy: "shrimpy" },
    { id: "career", modelPolicy: "career" },
  ]);
}

function testModelId(agentId: string): string {
  return agentId === "ole_scrappy" ? "scrappy-model" : `${agentId}-model`;
}

function testBootstraps(agents: ReturnType<typeof resolveAgentsConfig>) {
  return new Map(
    agents.map((agent) => [
      agent.id,
      {
        workspacePath: workspace,
        agentRootPath: join(workspace, "agents", agent.id),
        modelsPath: join(workspace, "state", "pi", "models.json"),
        config: {
          modelPolicies: {
            coding: {
              candidates: [{ provider: "test", id: testModelId(agent.id) }],
            },
            [agent.modelPolicy ?? agent.id]: {
              candidates: [{ provider: "test", id: testModelId(agent.id) }],
            },
          },
        },
        modelRegistry: {
          find(provider: string, id: string) {
            return provider === "test"
              ? { provider, id, contextWindow: 1000 }
              : undefined;
          },
          getAvailable() {
            return agents.map((agent) => ({
              provider: "test",
              id: testModelId(agent.id),
              contextWindow: 1000,
            }));
          },
        },
      },
    ]),
  ) as any;
}

describe("ChannelDeliveryLoop routing", () => {
  function testRuntime(agents: ReturnType<typeof testAgents>, memberships: ChannelMembershipStore) {
    return {
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
        gatewayStatePath: join(workspace, "gateway-state.json"),
      },
    } as any;
  }

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

    const runtime = testRuntime(agents, memberships);

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

  test("does not add a second channel queue above the session pool", async () => {
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
          },
        },
      },
    });

    const runtime = testRuntime(agents, memberships);
    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {} as any,
    }) as any;

    const calls: string[] = [];
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", {
        handleMessage: async (_channel: string, message: any) => {
          if (message.id === "first") {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          calls.push(message.id);
          dispatcher.stateStore.markHandled("shrimpy", "room-1", message.id);
        },
      }],
    ]);

    await Promise.all([
      dispatcher.enqueueMessage("room-1", {
        id: "first",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "first" } },
        timestamp: Date.now(),
      }, "live"),
      dispatcher.enqueueMessage("room-1", {
        id: "second",
        sender: { kind: "human", actorId: "human:alice" },
        origin: { transport: "telegram" },
        content: { type: "text", data: { text: "second" } },
        timestamp: Date.now(),
      }, "live"),
    ]);

    assert.deepEqual(calls, ["second", "first"]);
  });

  test("delivers stop controls while a turn is still running", async () => {
    const agents = testAgents();
    const memberships = new ChannelMembershipStore(
      join(workspace, "config", "channels.json"),
      agents,
    );
    memberships.write({
      channels: { "room-1": { agents: { shrimpy: {} } } },
    });
    const dispatcher = new ChannelDeliveryLoop({
      runtime: testRuntime(agents, memberships),
      bootstraps: testBootstraps(agents),
      channelBus: { publishStatus() {} } as any,
    }) as any;

    let finishTurn!: () => void;
    const running = new Promise<void>((resolve) => {
      finishTurn = resolve;
    });
    let started = false;
    let stopped = false;
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", {
        async handleMessage() {
          started = true;
          await running;
        },
        stop() {
          stopped = true;
          finishTurn();
          return { channel: "room-1", stopped: true, messageId: "turn-1" };
        },
      }],
    ]);
    dispatcher.controlRuntime = new SessionControlRuntime(
      dispatcher.channelBus,
      dispatcher.agentRuntimes,
    );

    const turn = dispatcher.enqueueMessage("room-1", {
      id: "turn-1",
      sender: { kind: "human", actorId: "human:alice" },
      origin: { transport: "telegram" },
      content: { type: "text", data: { text: "long turn" } },
      timestamp: Date.now(),
    }, "live");
    while (!started) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    const stop = dispatcher.enqueueMessage("room-1", {
      id: "stop-1",
      sender: { kind: "system", actorId: "system:cli" },
      origin: { transport: "cli" },
      content: {
        type: "control",
        data: {
          kind: "session_stop",
          targetAgentId: "shrimpy",
          command: "/stop",
        },
      },
      timestamp: Date.now(),
    }, "live");

    await Promise.race([
      Promise.all([turn, stop]),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error("stop was queued behind the running turn")),
        100,
      )),
    ]);
    assert.equal(stopped, true);
  });

  test("skips messages already acknowledged in the gateway ledger", async () => {
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
          },
        },
      },
    });

    const runtime = testRuntime(agents, memberships);
    const message = {
      id: "handled-1",
      sender: { kind: "human" as const, actorId: "human:alice" },
      origin: { transport: "telegram" },
      content: { type: "text" as const, data: { text: "hello" } },
      timestamp: Date.now(),
    };

    const first = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {} as any,
    }) as any;

    let calls = 0;
    first.agentRuntimes = new Map([
      ["shrimpy", {
        handleMessage: async () => {
          calls += 1;
          first.stateStore.markHandled("shrimpy", "room-1", message.id);
        },
      }],
    ]);
    await first.dispatchMessage("room-1", message, "live");

    const second = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {} as any,
    }) as any;
    second.agentRuntimes = new Map([
      ["shrimpy", {
        handleMessage: async () => {
          calls += 1;
        },
      }],
    ]);
    await second.dispatchMessage("room-1", message, "backlog");

    assert.equal(calls, 1);
    const state = loadGatewayRuntimeState(runtime.paths.gatewayStatePath);
    assert.ok(state.handled.shrimpy["room-1"][message.id]);
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

  test("routes Scrappy-style watch messages through channel membership and agent channel policy", async () => {
    const agents = resolveAgentsConfig([
      {
        id: "shrimpy",
        modelPolicy: "shrimpy",
        channelPolicy: { mode: "all", senders: ["human"] },
      },
      {
        id: "ole_scrappy",
        modelPolicy: "ole_scrappy",
        channelPolicy: {
          mode: "none",
          channels: {
            "telegram~main~4242": {
              mode: "all",
              senders: ["system"],
              actorIds: ["system:watch-runner"],
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
      id: "scrappy-watch",
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: {
        transport: "watch",
        watchId: "ole_scrappy/morning-letter",
        runId: "run-1",
        sourceChannel: "telegram~main~4242",
        watch: {
          ownerAgentId: "ole_scrappy",
          localId: "morning-letter",
          targetChannel: "telegram~main~4242",
          inspect: ["shrimpy watches show ole_scrappy/morning-letter"],
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

    const delivered: Array<{
      channel: string;
      text: string;
      requestMessageId: string;
      archiveName?: string;
    }> = [];
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
        publishStatus(input: any) {
          delivered.push({
            channel: input.channel,
            text: input.data.text,
            requestMessageId: input.data.requestMessageId,
            archiveName: input.data.archiveName,
          });
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
          return { archivedTo: "/tmp/career-archive.jsonl" };
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
        type: "control",
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
      requestMessageId: "reset-1",
      archiveName: "career-archive.jsonl",
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
        publishStatus(input: any) {
          delivered.push({ channel: input.channel, text: input.data.text });
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
        type: "control",
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
        publishStatus(input: any) {
          delivered.push({ channel: input.channel, text: input.data.text });
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
        type: "control",
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

  test("intercepts session stop control messages and stops only the target agent", async () => {
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
        gatewayStatePath: join(workspace, "gateway-state.json"),
      },
    } as any;

    const dispatcher = new ChannelDeliveryLoop({
      runtime,
      bootstraps: testBootstraps(agents),
      channelBus: {
        publishStatus(input: any) {
          delivered.push({ channel: input.channel, text: input.data.text });
        },
      } as any,
    }) as any;

    const calls: string[] = [];
    const stops: string[] = [];
    dispatcher.agentRuntimes = new Map([
      ["shrimpy", {
        async handleMessage() {
          calls.push("shrimpy");
        },
        stop(channel: string) {
          stops.push(`shrimpy:${channel}`);
          return { stopped: true };
        },
      }],
      ["career", {
        async handleMessage() {
          calls.push("career");
        },
        stop(channel: string) {
          stops.push(`career:${channel}`);
          return { stopped: true, messageId: "running-1" };
        },
      }],
    ]);
    dispatcher.controlRuntime = new SessionControlRuntime(
      dispatcher.channelBus,
      dispatcher.agentRuntimes,
    );

    await dispatcher.dispatchMessage("room-1", {
      id: "stop-1",
      sender: { kind: "human", actorId: "human:alice" },
      origin: { transport: "telegram" },
      content: {
        type: "control",
        data: {
          kind: "session_stop",
          targetAgentId: "career",
          command: "/stop",
        },
      },
      timestamp: Date.now(),
    }, "live");

    assert.deepEqual(calls, []);
    assert.deepEqual(stops, ["career:room-1"]);
    assert.deepEqual(delivered, [{
      channel: "room-1",
      text: "Stopped the running turn for career.",
    }]);
  });
});
