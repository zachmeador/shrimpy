import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelBus } from "../dist/channels/bus.js";
import { EgressRegistry } from "../dist/channels/egress.js";
import { ChannelMembershipStore } from "../dist/channels/membership.js";
import {
  ChannelOutbox,
  outboundTextForMessage,
  readDeliveryReceipts,
} from "../dist/channels/outbox.js";
import { sessionResetMessageInput } from "../dist/channels/protocol.js";
import { textContent } from "../dist/channels/messages.js";
import { saveCursors } from "../dist/channels/store.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-channel-outbox-test-"));
  mkdirSync(join(testDir, "channels"), { recursive: true });
  mkdirSync(join(testDir, "config"), { recursive: true });
  mkdirSync(join(testDir, "runtime", "cursors"), { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function agents() {
  return [{ id: "shrimpy", root: "agents/shrimpy" }] as any;
}

function createOutbox(registry: EgressRegistry, memberships: ChannelMembershipStore, bus: ChannelBus) {
  return new ChannelOutbox({
    channelBus: bus,
    memberships,
    egressRegistry: registry,
    cursorsPath: join(testDir, "runtime", "cursors", "outbox.json"),
    receiptsPath: join(testDir, "runtime", "deliveries.json"),
    retry: { maxAttempts: 1 },
  });
}

function seedOutboxCursor(cursors: Record<string, { byteOffset: number }> = {}) {
  saveCursors(join(testDir, "runtime", "cursors", "outbox.json"), cursors);
}

describe("ChannelOutbox", () => {
  test("bootstraps a missing outbox cursor without delivering historical messages", async () => {
    const bus = new ChannelBus(join(testDir, "channels"));
    const memberships = new ChannelMembershipStore(
      join(testDir, "config", "channels.json"),
      agents(),
    );
    memberships.bindChannel("telegram~main~4242", {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });

    const sent: any[] = [];
    const registry = new EgressRegistry();
    registry.register({ adapter: "telegram", instance: "main" }, async (delivery) => {
      sent.push(delivery);
    });
    const outbox = createOutbox(registry, memberships, bus);

    bus.publishAgentText({
      channel: "telegram~main~4242",
      text: "historical reply",
      actorId: "agent:shrimpy",
    });

    await outbox.drainBacklog();

    assert.equal(sent.length, 0);
    const cursorsPath = join(testDir, "runtime", "cursors", "outbox.json");
    assert.equal(existsSync(cursorsPath), true);
    const cursors = JSON.parse(readFileSync(cursorsPath, "utf-8"));
    assert.equal(
      cursors["telegram~main~4242"].byteOffset,
      statSync(bus.path("telegram~main~4242")).size,
    );
  });

  test("delivers bound agent messages and records receipts", async () => {
    const bus = new ChannelBus(join(testDir, "channels"));
    const memberships = new ChannelMembershipStore(
      join(testDir, "config", "channels.json"),
      agents(),
    );
    memberships.bindChannel("home", {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });

    const sent: any[] = [];
    const registry = new EgressRegistry();
    registry.register({ adapter: "telegram", instance: "main" }, async (delivery) => {
      sent.push(delivery);
    });
    const outbox = createOutbox(registry, memberships, bus);
    seedOutboxCursor();

    const human = bus.publishHumanText({
      channel: "home",
      text: "hello",
      actorId: "human:user:alice",
      transport: "cli",
    });
    const agent = bus.publishAgentText({
      channel: "home",
      text: "hi",
      actorId: "agent:shrimpy",
    });

    await outbox.drainBacklog();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].channel, "home");
    assert.deepEqual(sent[0].binding, {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });
    assert.equal(sent[0].message.id, agent.id);

    const receipts = readDeliveryReceipts(join(testDir, "runtime", "deliveries.json"));
    assert.equal(receipts.home?.[agent.id]?.status, "delivered");
    assert.equal(receipts.home?.[human.id], undefined);

    await outbox.drainBacklog();
    assert.equal(sent.length, 1);
  });

  test("does not deliver watch-origin system text to bound transports", async () => {
    const bus = new ChannelBus(join(testDir, "channels"));
    const memberships = new ChannelMembershipStore(
      join(testDir, "config", "channels.json"),
      agents(),
    );
    memberships.bindChannel("home", {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });

    const sent: any[] = [];
    const registry = new EgressRegistry();
    registry.register({ adapter: "telegram", instance: "main" }, async (delivery) => {
      sent.push(delivery);
    });
    const outbox = createOutbox(registry, memberships, bus);
    seedOutboxCursor();

    const watchPrompt = bus.publish({
      channel: "home",
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: {
        transport: "watch",
        watchId: "shrimpy/daily-practice",
        runId: "run-1",
        sourceChannel: "home",
        addressedAgentId: "shrimpy",
        watch: {
          kind: "recurring",
          ownerAgentId: "shrimpy",
          localId: "daily-practice",
          targetChannel: "home",
          actionKind: "message",
        },
      },
      content: textContent("Send today's scheduled message. Use reply to publish it."),
    });
    const agentReply = bus.publishAgentText({
      channel: "home",
      text: "Here is today's scheduled message.",
      actorId: "agent:shrimpy",
    });

    assert.equal(outboundTextForMessage(watchPrompt), null);

    await outbox.drainBacklog();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].message.id, agentReply.id);
    const receipts = readDeliveryReceipts(join(testDir, "runtime", "deliveries.json"));
    assert.equal(receipts.home?.[watchPrompt.id], undefined);
    assert.equal(receipts.home?.[agentReply.id]?.status, "delivered");
  });

  test("delivers command-watch system emissions to bound transports", async () => {
    const bus = new ChannelBus(join(testDir, "channels"));
    const memberships = new ChannelMembershipStore(
      join(testDir, "config", "channels.json"),
      agents(),
    );
    memberships.bindChannel("ops", {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });

    const sent: string[] = [];
    const registry = new EgressRegistry();
    registry.register({ adapter: "telegram", instance: "main" }, async (delivery) => {
      const text = outboundTextForMessage(delivery.message);
      if (text) sent.push(text);
    });
    const outbox = createOutbox(registry, memberships, bus);
    seedOutboxCursor();

    const message = bus.publish({
      channel: "ops",
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: {
        transport: "watch",
        watchId: "shrimpy/disk-space",
        runId: "run-1",
        sourceChannel: "ops",
        watch: {
          kind: "recurring",
          ownerAgentId: "shrimpy",
          localId: "disk-space",
          targetChannel: "ops",
          actionKind: "command",
        },
      },
      content: textContent("Disk check changed."),
    });

    await outbox.drainBacklog();

    assert.deepEqual(sent, ["Disk check changed."]);
    const receipts = readDeliveryReceipts(join(testDir, "runtime", "deliveries.json"));
    assert.equal(receipts.ops?.[message.id]?.status, "delivered");
  });

  test("does not deliver arbitrary system text to bound transports", async () => {
    const bus = new ChannelBus(join(testDir, "channels"));
    const memberships = new ChannelMembershipStore(
      join(testDir, "config", "channels.json"),
      agents(),
    );
    memberships.bindChannel("home", {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });

    const sent: any[] = [];
    const registry = new EgressRegistry();
    registry.register({ adapter: "telegram", instance: "main" }, async (delivery) => {
      sent.push(delivery);
    });
    const outbox = createOutbox(registry, memberships, bus);
    seedOutboxCursor();

    const message = bus.publish({
      channel: "home",
      sender: { kind: "system", actorId: "system:maintenance" },
      origin: {
        transport: "internal",
        sourceChannel: "home",
      },
      content: textContent("Internal maintenance note."),
    });

    assert.equal(outboundTextForMessage(message), null);

    await outbox.drainBacklog();

    assert.equal(sent.length, 0);
    const receipts = readDeliveryReceipts(join(testDir, "runtime", "deliveries.json"));
    assert.equal(receipts.home?.[message.id], undefined);
  });

  test("does not deliver surface addressing status messages", async () => {
    const bus = new ChannelBus(join(testDir, "channels"));
    const memberships = new ChannelMembershipStore(
      join(testDir, "config", "channels.json"),
      agents(),
    );
    memberships.bindChannel("telegram~main~4242", {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });

    const sent: any[] = [];
    const registry = new EgressRegistry();
    registry.register({ adapter: "telegram", instance: "main" }, async (delivery) => {
      sent.push(delivery);
    });
    const outbox = createOutbox(registry, memberships, bus);
    seedOutboxCursor();

    const message = bus.publishStatus({
      channel: "telegram~main~4242",
      actorId: "system:surface",
      transport: "chat",
      data: {
        kind: "surface_addressing",
        surface: "telegram.main",
        threadId: "4242",
        previousAgentId: null,
        addressedAgentId: "shrimpy",
        joinedAgentId: "shrimpy",
        source: "cli",
      },
    });

    assert.equal(outboundTextForMessage(message), null);

    await outbox.drainBacklog();

    assert.equal(sent.length, 0);
    const receipts = readDeliveryReceipts(join(testDir, "runtime", "deliveries.json"));
    assert.equal(receipts["telegram~main~4242"]?.[message.id], undefined);
  });

  test("delivers operation status acknowledgements", async () => {
    const bus = new ChannelBus(join(testDir, "channels"));
    const memberships = new ChannelMembershipStore(
      join(testDir, "config", "channels.json"),
      agents(),
    );
    memberships.bindChannel("telegram~main~4242", {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });

    const sent: string[] = [];
    const registry = new EgressRegistry();
    registry.register({ adapter: "telegram", instance: "main" }, async (delivery) => {
      const text = outboundTextForMessage(delivery.message);
      if (text) sent.push(text);
    });
    const outbox = createOutbox(registry, memberships, bus);
    seedOutboxCursor();

    const message = bus.publishStatus({
      channel: "telegram~main~4242",
      actorId: "system:session-control",
      transport: "internal",
      data: {
        kind: "operation_status",
        text: "Started a new session for shrimpy.",
        ok: true,
        targetAgentId: "shrimpy",
        operation: "reset",
      },
    });

    await outbox.drainBacklog();

    assert.deepEqual(sent, ["Started a new session for shrimpy."]);
    const receipts = readDeliveryReceipts(join(testDir, "runtime", "deliveries.json"));
    assert.equal(receipts["telegram~main~4242"]?.[message.id]?.status, "delivered");
  });

  test("does not deliver internal system or control records as JSON", async () => {
    const bus = new ChannelBus(join(testDir, "channels"));
    const memberships = new ChannelMembershipStore(
      join(testDir, "config", "channels.json"),
      agents(),
    );
    memberships.bindChannel("telegram~main~4242", {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });

    const sent: any[] = [];
    const registry = new EgressRegistry();
    registry.register({ adapter: "telegram", instance: "main" }, async (delivery) => {
      sent.push(delivery);
    });
    const outbox = createOutbox(registry, memberships, bus);
    seedOutboxCursor();

    const systemRecord = bus.publishSystem({
      channel: "telegram~main~4242",
      actorId: "system:cli",
      transport: "cli",
      data: {
        kind: "agent_updated",
        agentId: "shrimpy",
      },
    });
    const controlRecord = bus.publish(sessionResetMessageInput({
      channel: "telegram~main~4242",
      targetAgentId: "shrimpy",
      sender: {
        kind: "system",
        actorId: "system:cli",
      },
      origin: {
        transport: "cli",
        sourceChannel: "telegram~main~4242",
      },
      command: "/new",
    }));

    assert.equal(outboundTextForMessage(systemRecord), null);
    assert.equal(outboundTextForMessage(controlRecord), null);

    await outbox.drainBacklog();

    assert.equal(sent.length, 0);
    const receipts = readDeliveryReceipts(join(testDir, "runtime", "deliveries.json"));
    assert.equal(receipts["telegram~main~4242"]?.[systemRecord.id], undefined);
    assert.equal(receipts["telegram~main~4242"]?.[controlRecord.id], undefined);
  });

  test("records failed receipts when a bound route errors", async () => {
    const bus = new ChannelBus(join(testDir, "channels"));
    const memberships = new ChannelMembershipStore(
      join(testDir, "config", "channels.json"),
      agents(),
    );
    memberships.bindChannel("home", {
      adapter: "telegram",
      instance: "main",
      thread: "4242",
    });

    const registry = new EgressRegistry();
    registry.register({ adapter: "telegram", instance: "main" }, async () => {
      throw new Error("send failed");
    });
    const outbox = createOutbox(registry, memberships, bus);
    seedOutboxCursor();
    const message = bus.publishAgentText({
      channel: "home",
      text: "hi",
      actorId: "agent:shrimpy",
    });

    await outbox.drainBacklog();

    const receipts = readDeliveryReceipts(join(testDir, "runtime", "deliveries.json"));
    assert.equal(receipts.home?.[message.id]?.status, "failed");
    assert.equal(receipts.home?.[message.id]?.error, "send failed");
  });
});
