import { beforeEach, afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelBus } from "../dist/channels/bus.js";
import { readMessages } from "../dist/channels/index.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-channel-bus-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function createChannelBus() {
  const channelsDir = join(testDir, "channels");
  mkdirSync(channelsDir, { recursive: true });
  return new ChannelBus(channelsDir);
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

  test("rejects invalid channel names before writing", () => {
    const channelBus = createChannelBus();

    assert.throws(
      () =>
        channelBus.publishHumanText({
          channel: "../outside",
          text: "hello",
          actorId: "human:user:alice",
          userId: "user:alice",
          displayName: "alice",
          transport: "cli",
        }),
      /invalid channel name "\.\.\/outside"/,
    );
    assert.equal(existsSync(join(testDir, "outside.jsonl")), false);
  });

  test("publishAgentText logs agent messages without delivering", async () => {
    const channelBus = createChannelBus();

    channelBus.publishAgentText({
      channel: "telegram-42",
      text: "pong",
      actorId: "agent:shrimpy",
      publication: { kind: "reply" },
    });

    const { messages } = readMessages(channelBus.path("telegram-42"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.kind, "agent");
    assert.equal(messages[0].sender.actorId, "agent:shrimpy");
    assert.deepEqual(messages[0].content.data.publication, { kind: "reply" });
  });

});
