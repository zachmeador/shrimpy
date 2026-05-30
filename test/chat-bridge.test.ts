import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelBus } from "../dist/channels/bus.js";
import {
  ChatSurfacePublisher,
  mergeChatTextBurst,
} from "../dist/surfaces/shared/chat-bridge.js";
import { SurfaceThreadStateStore } from "../dist/surfaces/shared/thread-state-store.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-chat-bridge-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("ChatSurfacePublisher", () => {
  test("publishes chat text with surface thread addressed-agent state", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });
    const channelBus = new ChannelBus(channelsDir);
    const threadStateStore = new SurfaceThreadStateStore(
      join(testDir, "surface-state.json"),
    );
    threadStateStore.setAddressedAgent("discord.main", "thread-1", "planner");

    const publisher = new ChatSurfacePublisher({
      channelBus,
      surfaceId: "discord.main",
      defaultAgentId: "shrimpy",
      threadStateStore,
    });

    publisher.publishText({
      channel: "discord~main~thread-1",
      text: "hello from discord",
      messageBase: {
        sender: {
          kind: "human",
          actorId: "human:alice",
          userId: "alice",
          displayName: "Alice",
        },
        origin: {
          transport: "discord",
          transportUserId: "user-1",
          transportChatId: "thread-1",
        },
      },
    });

    const { messages } = channelBus.read("discord~main~thread-1");
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.actorId, "human:alice");
    assert.equal(messages[0].origin.transport, "discord");
    assert.equal(messages[0].origin.transportUserId, "user-1");
    assert.equal(messages[0].origin.transportChatId, "thread-1");
    assert.equal(messages[0].origin.addressedAgentId, "planner");
    assert.deepEqual(messages[0].content, {
      type: "text",
      data: { text: "hello from discord" },
    });
  });
});

describe("mergeChatTextBurst", () => {
  test("preserves explicit newlines and separates adjacent chunks", () => {
    assert.equal(
      mergeChatTextBurst(["first", "second", "\nthird"]),
      "first\nsecond\nthird",
    );
  });
});
