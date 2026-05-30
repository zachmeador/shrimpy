import { beforeEach, afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EgressRegistry } from "../dist/channels/egress.js";
import { ChannelBus } from "../dist/channels/bus.js";
import { readMessages } from "../dist/channels/index.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-channel-bus-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function createChannelBus(egressRegistry = new EgressRegistry()) {
  const channelsDir = join(testDir, "channels");
  mkdirSync(channelsDir, { recursive: true });
  return new ChannelBus(channelsDir, egressRegistry);
}

describe("ChannelBus", () => {
  test("publishHumanText writes canonical human text messages", () => {
    const channelBus = createChannelBus();

    channelBus.publishHumanText({
      channel: "telegram-42",
      text: "hello",
      actorId: "human:user:alice",
      userId: "user:alice",
      displayName: "alice",
      transport: "telegram",
      transportUserId: "42",
      transportChatId: "42",
    });

    const { messages } = readMessages(channelBus.path("telegram-42"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.kind, "human");
    assert.equal(messages[0].sender.actorId, "human:user:alice");
    assert.equal(messages[0].origin.sourceChannel, "telegram-42");
    assert.deepEqual(messages[0].content.data, { text: "hello" });
  });

  test("sendAgentText logs and delivers through the adapter registry", async () => {
    const delivered: any[] = [];
    const registry = new EgressRegistry();
    registry.register("telegram-", async (delivery) => {
      delivered.push(delivery);
    });
    const channelBus = createChannelBus(registry);

    const result = await channelBus.sendAgentText({
      channel: "telegram-42",
      text: "pong",
      actorId: "agent:shrimpy",
      publication: { kind: "reply" },
    });

    assert.equal(result, true);
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].channel, "telegram-42");
    assert.equal(delivered[0].text, "pong");
    assert.deepEqual(delivered[0].publication, { kind: "reply" });
    assert.deepEqual(delivered[0].message.content.data.publication, { kind: "reply" });

    const { messages } = readMessages(channelBus.path("telegram-42"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.kind, "agent");
    assert.equal(messages[0].sender.actorId, "agent:shrimpy");
    assert.deepEqual(messages[0].content.data.publication, { kind: "reply" });
  });

});
