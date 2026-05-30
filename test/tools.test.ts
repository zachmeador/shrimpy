import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  EgressRegistry,
} from "../dist/channels/egress.js";
import { registerTelegramRoute } from "../dist/surfaces/telegram/index.js";
import { createDaemonTools } from "../dist/tools/index.js";
import { ChannelBus } from "../dist/channels/bus.js";
import {
  appendMessage,
  channelPath,
  makeMessage,
  readMessages,
  textContent,
} from "../dist/channels/index.js";
import {
  getToolProse,
  renderReadChannelResult,
  renderRunChildResult,
  renderSendMessageResult,
} from "../dist/context/index.js";
import { resolveToolRuntimeConfig } from "../dist/config/tools.js";
import {
  DAEMON_TOOL_NAMES,
  createSessionToolPolicy,
  resolveAgentToolPolicy,
} from "../dist/tools/index.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-tools-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function createBootstrap() {
  return {
    agentRootPath: testDir,
    workspacePath: testDir,
  } as any;
}

function createChannelBus(egressRegistry = new EgressRegistry()) {
  const channelsDir = join(testDir, "channels");
  mkdirSync(channelsDir, { recursive: true });
  return new ChannelBus(channelsDir, egressRegistry);
}

function findTool(name: string, tools: any[]) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `expected tool ${name} to exist`);
  return tool;
}

describe("send_message", () => {
  test("logs the message when no adapter is registered", async () => {
    const channelBus = createChannelBus();

    const tools = createDaemonTools({
      channelBus,
      bootstrap: createBootstrap(),
    });
    const sendMessage = findTool("send_message", tools);

    const result = await sendMessage.execute(
      "call-1",
      { channel: "unknown-1", text: "hello" },
      new AbortController().signal,
      () => {},
      {},
    );

    assert.equal(result.content[0].type, "text");
    assert.equal(
      result.content[0].text,
      "Logged to unknown-1 (no adapter for delivery). Wait until a new message is received.",
    );

    const { messages } = readMessages(channelPath(channelBus.channelsDir, "unknown-1"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.kind, "agent");
    assert.deepEqual(messages[0].content.data, { text: "hello" });
  });

  test("delivers through the adapter and logs", async () => {
    const delivered: Array<{ channel: string; text: string }> = [];
    const egress = new EgressRegistry();
    egress.register("telegram-", async (channel, text) => {
      delivered.push({ channel, text });
    });
    const channelBus = createChannelBus(egress);

    const tools = createDaemonTools({
      channelBus,
      bootstrap: createBootstrap(),
    });
    const sendMessage = findTool("send_message", tools);

    const result = await sendMessage.execute(
      "call-1",
      { channel: "telegram-123", text: "hello" },
      new AbortController().signal,
      () => {},
      {},
    );

    assert.equal(result.content[0].type, "text");
    assert.equal(
      result.content[0].text,
      "Delivered to the user on telegram-123. Wait until a new message is received.",
    );
    assert.deepEqual(delivered, [
      { channel: "telegram-123", text: "hello" },
    ]);

    const { messages } = readMessages(channelPath(channelBus.channelsDir, "telegram-123"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.kind, "agent");
    assert.deepEqual(messages[0].content.data, { text: "hello" });
  });

  test("uses provided send_message actor id override", async () => {
    const channelBus = createChannelBus();

    const tools = createDaemonTools({
      channelBus,
      bootstrap: createBootstrap(),
      sendMessageActorId: "agent:heartbeat",
    });
    const sendMessage = findTool("send_message", tools);

    await sendMessage.execute(
      "call-1",
      { channel: "telegram-123", text: "hello" },
      new AbortController().signal,
      () => {},
      {},
    );

    const { messages } = readMessages(channelPath(channelBus.channelsDir, "telegram-123"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.actorId, "agent:heartbeat");
  });

  test("registerTelegramRoute supports custom route prefixes", async () => {
    const calls: Array<{ chatId: number; text: string }> = [];
    const registry = new EgressRegistry();
    registerTelegramRoute(
      registry,
      {
        async sendMessage(chatId: number, text: string) {
          calls.push({ chatId, text });
        },
      } as any,
      "tg-chat-",
    );

    const delivered = await registry.send("tg-chat-4242", "hi");
    assert.equal(delivered, true);
    assert.deepEqual(calls, [{ chatId: 4242, text: "hi" }]);
  });
});

describe("read_channel", () => {
  test("uses configured default limit when limit is omitted", async () => {
    const channelBus = createChannelBus();
    const channel = "telegram-123";
    const path = channelPath(channelBus.channelsDir, channel);

    for (const text of ["first", "second", "third"]) {
      appendMessage(path, makeMessage({
        sender: {
          kind: "human",
          actorId: "human:user:test",
          userId: "user:test",
          displayName: "test",
        },
        origin: { transport: "telegram" },
        content: textContent(text),
      }));
    }

    const tools = createDaemonTools({
      channelBus,
      bootstrap: createBootstrap(),
      toolConfig: resolveToolRuntimeConfig({
        readChannel: { defaultLimit: 2 },
      }),
    });
    const readChannel = findTool("read_channel", tools);

    const result = await readChannel.execute(
      "call-1",
      { channel },
      new AbortController().signal,
      () => {},
      {},
    );

    assert.equal(result.content[0].type, "text");
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.length, 2);
    assert.equal(payload[0].content.data.text, "second");
    assert.equal(payload[1].content.data.text, "third");
  });
});

describe("run_child", () => {
  test("disposes the child session when prompt execution fails", async () => {
    let disposed = false;
    const session = {
      subscribe() {
        return () => {};
      },
      async prompt() {
        throw new Error("boom");
      },
      dispose() {
        disposed = true;
      },
    };

    const tools = createDaemonTools({
      channelBus: createChannelBus(),
      bootstrap: createBootstrap(),
      sessionFactory: async () => session as any,
    });
    const runChild = findTool("run_child", tools);

    await assert.rejects(
      runChild.execute(
        "call-1",
        { prompt: "do the thing" },
        new AbortController().signal,
        () => {},
        {},
      ),
      /boom/,
    );

    assert.equal(disposed, true);
  });

  test("disposes the child session when aborted", async () => {
    let disposed = false;
    const listeners: Array<(event: { type: string }) => void> = [];
    const session = {
      subscribe(listener: (event: { type: string }) => void) {
        listeners.push(listener);
        return () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        };
      },
      async prompt() {
        await new Promise(() => {});
      },
      dispose() {
        disposed = true;
      },
    };

    const tools = createDaemonTools({
      channelBus: createChannelBus(),
      bootstrap: createBootstrap(),
      sessionFactory: async () => session as any,
    });
    const runChild = findTool("run_child", tools);
    const controller = new AbortController();

    const result = runChild.execute(
      "call-1",
      { prompt: "do the thing" },
      controller.signal,
      () => {},
      {},
    );
    controller.abort();

    await assert.rejects(result, /aborted/);
    assert.equal(disposed, true);
  });

  test("uses a fresh child session dir for each run", async () => {
    const sessionPlans: Array<{ descriptor: { sessionDir: string; kind: string; channel?: string } }> = [];
    const channelBus = createChannelBus();
    const tools = createDaemonTools({
      channelBus,
      bootstrap: createBootstrap(),
      sessionFactory: async (_bootstrap, opts) => {
        sessionPlans.push(opts as any);
        return {
          subscribe() {
            return () => {};
          },
          async prompt() {
            throw new Error("boom");
          },
          dispose() {},
        } as any;
      },
    });
    const runChild = findTool("run_child", tools);

    await assert.rejects(
      runChild.execute(
        "call-1",
        { prompt: "one" },
        new AbortController().signal,
        () => {},
        {},
      ),
      /boom/,
    );
    await assert.rejects(
      runChild.execute(
        "call-2",
        { prompt: "two" },
        new AbortController().signal,
        () => {},
        {},
      ),
      /boom/,
    );

    assert.equal(sessionPlans.length, 2);
    assert.equal(sessionPlans[0].descriptor.kind, "run");
    assert.equal(sessionPlans[0].descriptor.channel, "run");
    assert.equal(sessionPlans[1].descriptor.kind, "run");
    assert.equal(sessionPlans[1].descriptor.channel, "run");
    assert.notEqual(sessionPlans[0].descriptor.sessionDir, sessionPlans[1].descriptor.sessionDir);
    const base = join(testDir, "sessions", "children");
    assert.ok(sessionPlans[0].descriptor.sessionDir.startsWith(base));
    assert.ok(sessionPlans[1].descriptor.sessionDir.startsWith(base));
  });

  test("passes the effective tool policy to child sessions", async () => {
    const sessionPlans: Array<{ toolPolicy?: { excludedToolNames?: string[] } }> = [];
    const tools = createDaemonTools({
      channelBus: createChannelBus(),
      bootstrap: createBootstrap(),
      toolPolicy: { excludedToolNames: ["bash"] },
      sessionFactory: async (_bootstrap, opts) => {
        sessionPlans.push(opts as any);
        return {
          subscribe() {
            return () => {};
          },
          async prompt() {
            throw new Error("boom");
          },
          dispose() {},
        } as any;
      },
    });
    const runChild = findTool("run_child", tools);

    await assert.rejects(
      runChild.execute(
        "call-1",
        { prompt: "one" },
        new AbortController().signal,
        () => {},
        {},
      ),
      /boom/,
    );

    assert.deepEqual(sessionPlans[0].toolPolicy, {
      excludedToolNames: ["bash"],
    });
  });
});

describe("tool selection", () => {
  test("returns only explicitly allowed tools", () => {
    const tools = createDaemonTools({
      channelBus: createChannelBus(),
      bootstrap: createBootstrap(),
      toolNames: ["read_channel", "send_message"],
    });

    assert.deepEqual(
      tools.map((tool) => tool.name),
      ["read_channel", "send_message"],
    );
  });

  test("throws when an unknown tool is requested", () => {
    assert.throws(
      () =>
        createDaemonTools({
          channelBus: createChannelBus(),
          bootstrap: createBootstrap(),
          toolNames: ["not_a_real_tool"] as any,
        }),
      /unknown daemon tool/,
    );
  });
});

describe("agent tool policy", () => {
  test("combines default Pi tools with Shrimpy daemon tools", () => {
    const policy = resolveAgentToolPolicy({
      id: "shrimpy",
      attention: {} as any,
    });

    assert.deepEqual(policy.daemonToolNames, [
      "send_message",
      "read_channel",
      "run_child",
    ]);
    assert.deepEqual(policy.activeToolNames, [
      "read",
      "bash",
      "edit",
      "write",
      "send_message",
      "read_channel",
      "run_child",
    ]);

    const grep = policy.capabilities.find((tool) => tool.name === "grep");
    assert.equal(grep?.registered, true);
    assert.equal(grep?.active, false);
    assert.equal(grep?.status, "registered");
  });

  test("marks disabled tools as excluded session policy", () => {
    const policy = resolveAgentToolPolicy({
      id: "shrimpy",
      disabledTools: ["bash", "external_tool"],
      attention: {} as any,
    });

    assert.equal(policy.activeToolNames.includes("bash"), false);
    assert.equal(policy.capabilities.find((tool) => tool.name === "bash")?.status, "excluded");
    assert.deepEqual(createSessionToolPolicy(policy), {
      excludedToolNames: ["bash", "external_tool"],
    });

    const external = policy.capabilities.find((tool) => tool.name === "external_tool");
    assert.equal(external?.origin, "unknown");
    assert.equal(external?.registered, false);
    assert.equal(external?.excluded, true);
  });
});

describe("tool context prose", () => {
  test("has prose for every daemon tool", () => {
    for (const name of DAEMON_TOOL_NAMES) {
      const prose = getToolProse(name);
      assert.equal(typeof prose.description, "string");
      assert.equal(typeof prose.promptSnippet, "string");
      assert.ok(prose.description.length > 0);
      assert.ok(prose.promptSnippet.length > 0);
    }
  });

  test("renders daemon tool result text", () => {
    assert.equal(
      renderSendMessageResult({ channel: "home", delivered: true }),
      "Delivered to the user on home. Wait until a new message is received.",
    );
    assert.equal(
      renderReadChannelResult({ messages: [{ id: "1" }] }),
      '[\n  {\n    "id": "1"\n  }\n]',
    );
    assert.equal(
      renderRunChildResult({ assistantText: "" }),
      "(no response from child session)",
    );
  });
});
