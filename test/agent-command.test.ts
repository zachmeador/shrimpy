import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelBus } from "../dist/channels/bus.js";
import { cmdAgent } from "../dist/commands/agent.js";
import { SurfaceThreadStateStore } from "../dist/surfaces/shared/thread-state-store.js";
import { setupInit } from "../dist/setup.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-agent-command-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

function withMutedConsole<T>(fn: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  console.log = () => {};
  return fn().finally(() => {
    console.log = originalLog;
  });
}

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

describe("cmdAgent lifecycle", () => {
  test("scaffolds explicit agent roots without changing channel membership", async () => {
    await setupInit(workspace);

    const code = await withMutedConsole(() =>
      cmdAgent(["add", "career", "--root", "agent-roots/career"], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    const agent = config.agents.find((entry: any) => entry.id === "career");
    assert.equal(agent.root, "agent-roots/career");
    assert.equal(agent.channels, undefined);

    assert.equal(existsSync(join(workspace, "agent-roots", "career", "SOUL.md")), true);

    const memberships = JSON.parse(
      readFileSync(join(workspace, "config", "channels.json"), "utf-8"),
    );
    assert.deepEqual(memberships.channels.home.agents, {
      shrimpy: {},
    });

    const homeBus = new ChannelBus(join(workspace, "channels"));
    const { messages } = homeBus.read("home");
    assert.equal(messages.at(-1)?.content.type, "system");
    assert.deepEqual(messages.at(-1)?.content.data, {
      kind: "agent_added",
      agentId: "career",
    });
  });

  test("keeps generic agent defaults when add is used plainly", async () => {
    await setupInit(workspace);

    const code = await withMutedConsole(() =>
      cmdAgent(["add", "helper"], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    const agent = config.agents.find((entry: any) => entry.id === "helper");
    assert.equal(agent.root, "agents/helper");
    assert.equal(agent.channels, undefined);
    assert.equal(agent.thinking, undefined);
  });

  test("stores an agent thinking default when provided", async () => {
    await setupInit(workspace);

    const code = await withMutedConsole(() =>
      cmdAgent(["add", "planner", "--thinking", "low"], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    const agent = config.agents.find((entry: any) => entry.id === "planner");
    assert.equal(agent.thinking, "low");
  });

  test("stores an agent model default when provided", async () => {
    await setupInit(workspace);

    const code = await withMutedConsole(() =>
      cmdAgent([
        "add",
        "planner",
        "--provider",
        "local",
        "--model",
        "qwen-27b",
      ], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    const agent = config.agents.find((entry: any) => entry.id === "planner");
    assert.deepEqual(agent.model, {
      provider: "local",
      id: "qwen-27b",
    });
  });

  test("stores an agent attention mode when provided", async () => {
    await setupInit(workspace);

    const code = await withMutedConsole(() =>
      cmdAgent(["add", "listener", "--attention", "mentions"], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    const agent = config.agents.find((entry: any) => entry.id === "listener");
    assert.deepEqual(agent.attention, { mode: "mentions" });
  });

  test("shows effective agent attention for a channel", async () => {
    await setupInit(workspace);

    const configPath = join(workspace, "config", "shrimpy.json");
    const configJson = JSON.parse(readFileSync(configPath, "utf-8"));
    configJson.agents[0].attention = {
      mode: "mentions",
      channels: {
        home: { mode: "all", senders: ["human"] },
      },
    };
    writeFileSync(configPath, JSON.stringify(configJson, null, 2) + "\n", "utf-8");
    const config = { ...configJson, workspace };

    const { result, lines } = await captureLogs(() =>
      cmdAgent(["attention", "shrimpy", "--channel", "home", "--json"], config as any)
    );

    assert.equal(result, 0);
    const attention = JSON.parse(lines.join("\n"));
    assert.equal(attention.agentId, "shrimpy");
    assert.deepEqual(attention.matchedChannelOverrides, ["home"]);
    assert.deepEqual(attention.effectiveAttention, {
      mode: "all",
      senders: ["human"],
      actorIds: [],
      userIds: [],
    });
    assert.equal(
      attention.impliedPolicies.includes("origin.addressedAgentId routes only to that agent"),
      true,
    );
  });

  test("tests agent attention decisions with reasons", async () => {
    await setupInit(workspace);

    const configPath = join(workspace, "config", "shrimpy.json");
    const configJson = JSON.parse(readFileSync(configPath, "utf-8"));
    configJson.agents[0].attention = { mode: "none" };
    writeFileSync(configPath, JSON.stringify(configJson, null, 2) + "\n", "utf-8");
    const config = { ...configJson, workspace };

    const { result, lines } = await captureLogs(() =>
      cmdAgent([
        "attention",
        "test",
        "shrimpy",
        "--channel",
        "home",
        "--sender",
        "human",
        "--text",
        "@shrimpy wassup",
        "--json",
      ], config as any)
    );

    assert.equal(result, 0);
    const decision = JSON.parse(lines.join("\n"));
    assert.equal(decision.handles, true);
    assert.equal(decision.reason, "human single-agent mention");
    assert.equal(
      decision.impliedRule,
      "human @agent mentions call that agent even when ambient attention is quiet",
    );
    assert.deepEqual(decision.message.mentionedAgentIds, ["shrimpy"]);
  });

  test("sets fine-grained base attention fields without dropping the mode", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "watcher", "--attention", "mentions"], { workspace } as any)
    );

    const code = await withMutedConsole(() =>
      cmdAgent([
        "attention",
        "set",
        "watcher",
        "--senders",
        "human,human,system",
        "--actor-ids",
        "telegram:42",
      ], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    const agent = config.agents.find((entry: any) => entry.id === "watcher");
    assert.deepEqual(agent.attention, {
      mode: "mentions",
      senders: ["human", "system"],
      actorIds: ["telegram:42"],
    });

    const homeBus = new ChannelBus(join(workspace, "channels"));
    const { messages } = homeBus.read("home");
    assert.deepEqual(messages.at(-1)?.content.data, {
      kind: "agent_updated",
      agentId: "watcher",
      updatedFields: ["attention"],
    });
  });

  test("sets and clears a channel attention override", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "watcher", "--attention", "mentions"], { workspace } as any)
    );

    await withMutedConsole(() =>
      cmdAgent([
        "attention",
        "set",
        "watcher",
        "--channel",
        "ops",
        "--mode",
        "all",
        "--senders",
        "system",
      ], { workspace } as any)
    );

    let agent = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    ).agents.find((entry: any) => entry.id === "watcher");
    assert.deepEqual(agent.attention, {
      mode: "mentions",
      channels: { ops: { mode: "all", senders: ["system"] } },
    });

    // Clearing one override field keeps the rest of the override.
    await withMutedConsole(() =>
      cmdAgent(["attention", "clear", "watcher", "--channel", "ops", "--senders"], {
        workspace,
      } as any)
    );
    agent = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    ).agents.find((entry: any) => entry.id === "watcher");
    assert.deepEqual(agent.attention, {
      mode: "mentions",
      channels: { ops: { mode: "all" } },
    });

    // Clearing the override with no fields removes it entirely.
    await withMutedConsole(() =>
      cmdAgent(["attention", "clear", "watcher", "--channel", "ops"], { workspace } as any)
    );
    agent = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    ).agents.find((entry: any) => entry.id === "watcher");
    assert.deepEqual(agent.attention, { mode: "mentions" });
  });

  test("removes the attention key when the last field is cleared", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "watcher", "--attention", "mentions"], { workspace } as any)
    );

    const code = await withMutedConsole(() =>
      cmdAgent(["attention", "clear", "watcher", "--mode"], { workspace } as any)
    );

    assert.equal(code, 0);
    const agent = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    ).agents.find((entry: any) => entry.id === "watcher");
    assert.equal("attention" in agent, false);
  });

  test("edited attention changes the attention test decision", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "watcher", "--attention", "all"], { workspace } as any)
    );
    await withMutedConsole(() =>
      cmdAgent(["attention", "set", "watcher", "--senders", "human"], { workspace } as any)
    );

    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    const human = await captureLogs(() =>
      cmdAgent([
        "attention",
        "test",
        "watcher",
        "--channel",
        "home",
        "--sender",
        "human",
        "--text",
        "hi",
        "--json",
      ], config as any)
    );
    assert.equal(JSON.parse(human.lines.join("\n")).handles, true);

    const fromAgent = await captureLogs(() =>
      cmdAgent([
        "attention",
        "test",
        "watcher",
        "--channel",
        "home",
        "--sender",
        "agent",
        "--actor-id",
        "agent:other",
        "--text",
        "hi",
        "--json",
      ], config as any)
    );
    const decision = JSON.parse(fromAgent.lines.join("\n"));
    assert.equal(decision.handles, false);
    assert.equal(decision.reason, "sender does not match effective attention filters");
  });

  test("rejects attention set with no fields and clear with no target", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "watcher"], { workspace } as any)
    );

    const originalError = console.error;
    console.error = () => {};
    try {
      const setCode = await withMutedConsole(() =>
        cmdAgent(["attention", "set", "watcher"], { workspace } as any)
      );
      assert.equal(setCode, 1);

      const clearCode = await withMutedConsole(() =>
        cmdAgent(["attention", "clear", "watcher"], { workspace } as any)
      );
      assert.equal(clearCode, 1);
    } finally {
      console.error = originalError;
    }

    // A failed mutation must not have written an attention block.
    const agent = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    ).agents.find((entry: any) => entry.id === "watcher");
    assert.equal(agent.attention, undefined);
  });

  test("maps agent thinking on to a medium default", async () => {
    await setupInit(workspace);

    const code = await withMutedConsole(() =>
      cmdAgent(["add", "planner", "--thinking", "on"], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    const agent = config.agents.find((entry: any) => entry.id === "planner");
    assert.equal(agent.thinking, "medium");
  });

  test("removes an agent from config, memberships, and surface state", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "career", "--root", "agent-roots/career"], { workspace } as any)
    );

    const surfaceState = new SurfaceThreadStateStore(join(workspace, "runtime", "cursors", "surface-threads.json"));
    surfaceState.setAddressedAgent("telegram", "4242", "career");

    const code = await withMutedConsole(() =>
      cmdAgent(["remove", "career"], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    assert.equal(config.agents.some((entry: any) => entry.id === "career"), false);

    const memberships = JSON.parse(
      readFileSync(join(workspace, "config", "channels.json"), "utf-8"),
    );
    assert.deepEqual(memberships.channels.home.agents, {
      shrimpy: {},
    });
    assert.deepEqual(surfaceState.list(), []);

    assert.equal(existsSync(join(workspace, "agent-roots", "career", "SOUL.md")), true);
  });

  test("can delete agent files during removal", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "career", "--root", "agent-roots/career"], { workspace } as any)
    );

    const code = await withMutedConsole(() =>
      cmdAgent(["remove", "career", "--delete-files"], { workspace } as any)
    );

    assert.equal(code, 0);
    assert.equal(existsSync(join(workspace, "agent-roots", "career")), false);

    const homeBus = new ChannelBus(join(workspace, "channels"));
    const { messages } = homeBus.read("home");
    assert.equal(messages.at(-1)?.content.type, "system");
    assert.deepEqual(messages.at(-1)?.content.data, {
      kind: "agent_removed",
      agentId: "career",
      deletedFiles: true,
    });
  });

  test("renames an agent, updating memberships and surface state", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "career"], { workspace } as any)
    );
    const membershipsPath = join(workspace, "config", "channels.json");
    const membershipsBefore = JSON.parse(readFileSync(membershipsPath, "utf-8"));
    membershipsBefore.channels.home.agents.career = {};
    writeFileSync(membershipsPath, JSON.stringify(membershipsBefore, null, 2) + "\n", "utf-8");

    const surfaceState = new SurfaceThreadStateStore(join(workspace, "runtime", "cursors", "surface-threads.json"));
    surfaceState.setAddressedAgent("telegram", "4242", "career");

    const code = await withMutedConsole(() =>
      cmdAgent(["rename", "career", "jobs"], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    assert.equal(config.agents.some((entry: any) => entry.id === "career"), false);
    const agent = config.agents.find((entry: any) => entry.id === "jobs");
    assert.equal(agent.root, "agents/jobs");

    const memberships = JSON.parse(
      readFileSync(join(workspace, "config", "channels.json"), "utf-8"),
    );
    assert.deepEqual(Object.keys(memberships.channels.home.agents).sort(), ["jobs", "shrimpy"]);
    assert.deepEqual(memberships.channels.home.agents.jobs, {});
    assert.deepEqual(surfaceState.list(), [
      { surface: "telegram", threadId: "4242", addressedAgentId: "jobs" },
    ]);

    assert.equal(existsSync(join(workspace, "agents", "career")), false);
    assert.equal(existsSync(join(workspace, "agents", "jobs", "SOUL.md")), true);

    const homeBus = new ChannelBus(join(workspace, "channels"));
    const { messages } = homeBus.read("home");
    assert.equal(messages.at(-1)?.content.type, "system");
    assert.deepEqual(messages.at(-1)?.content.data, {
      kind: "agent_renamed",
      fromAgentId: "career",
      toAgentId: "jobs",
    });
  });

  test("lists agents as JSON", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "career", "--root", "agent-roots/career"], { workspace } as any)
    );
    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    const { result, lines } = await captureLogs(() =>
      cmdAgent(["list", "--json"], config as any)
    );

    assert.equal(result, 0);
    const agents = JSON.parse(lines.join("\n"));
    assert.deepEqual(agents.map((entry: any) => entry.id).sort(), ["career", "shrimpy"]);
    const career = agents.find((entry: any) => entry.id === "career");
    assert.equal(career.paths.root, join(workspace, "agent-roots", "career"));
    assert.equal(career.root, "agent-roots/career");
    assert.deepEqual(career.toolPolicy.activeToolNames, [
      "read",
      "bash",
      "edit",
      "write",
      "send_message",
      "read_channel",
      "run_child",
    ]);
  });

  test("inspects effective tool capability policy", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["set", "shrimpy", "--disable-tools", "bash"], { workspace } as any)
    );
    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    const { result, lines } = await captureLogs(() =>
      cmdAgent(["inspect", "shrimpy", "--json"], config as any)
    );

    assert.equal(result, 0);
    const agent = JSON.parse(lines.join("\n"));
    assert.deepEqual(agent.disabledTools, ["bash"]);
    assert.equal(agent.toolPolicy.activeToolNames.includes("bash"), false);
    assert.equal(
      agent.toolPolicy.capabilities.find((tool: any) => tool.name === "bash").status,
      "excluded",
    );
    assert.equal(
      agent.toolPolicy.capabilities.find((tool: any) => tool.name === "grep").status,
      "registered",
    );
  });

  test("updates agent config and root with set", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "helper"], { workspace } as any)
    );

    const code = await withMutedConsole(() =>
      cmdAgent([
        "set",
        "helper",
        "--root",
        "agent-roots/helper",
        "--provider",
        "local",
        "--model",
        "qwen-27b",
        "--tools",
        "send_message,read_channel",
        "--disable-tools",
        "bash",
        "--thinking",
        "high",
        "--attention",
        "addressed",
      ], { workspace } as any)
    );

    assert.equal(code, 0);

    const config = JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    );
    const agent = config.agents.find((entry: any) => entry.id === "helper");
    assert.equal(agent.root, "agent-roots/helper");
    assert.deepEqual(agent.model, {
      provider: "local",
      id: "qwen-27b",
    });
    assert.equal(agent.channels, undefined);
    assert.equal(agent.triggers, undefined);
    assert.deepEqual(agent.tools, ["send_message", "read_channel"]);
    assert.deepEqual(agent.disabledTools, ["bash"]);
    assert.equal(agent.thinking, "high");
    assert.deepEqual(agent.attention, { mode: "addressed" });

    const memberships = JSON.parse(
      readFileSync(join(workspace, "config", "channels.json"), "utf-8"),
    );
    assert.deepEqual(memberships.channels.home.agents, {
      shrimpy: {},
    });
    assert.equal(memberships.channels.ops, undefined);
    assert.equal(existsSync(join(workspace, "agents", "helper")), false);
    assert.equal(existsSync(join(workspace, "agent-roots", "helper")), true);

    const homeBus = new ChannelBus(join(workspace, "channels"));
    const { messages } = homeBus.read("home");
    assert.equal(messages.at(-1)?.content.type, "system");
    assert.deepEqual(messages.at(-1)?.content.data, {
      kind: "agent_updated",
      agentId: "helper",
      updatedFields: ["root", "model", "tools", "disabledTools", "thinking", "attention"],
    });
  });

  test("moves an existing root when set changes it", async () => {
    await setupInit(workspace);
    await withMutedConsole(() =>
      cmdAgent(["add", "career"], { workspace } as any)
    );

    writeFileSync(join(workspace, "agents", "career", "note.txt"), "hello\n", "utf-8");

    const code = await withMutedConsole(() =>
      cmdAgent(["set", "career", "--root", "agent-roots/jobs"], { workspace } as any)
    );

    assert.equal(code, 0);
    assert.equal(existsSync(join(workspace, "agents", "career")), false);
    assert.equal(existsSync(join(workspace, "agent-roots", "jobs", "note.txt")), true);
  });
});
