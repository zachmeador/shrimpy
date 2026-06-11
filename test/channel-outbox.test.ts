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
  readDeliveryReceipts,
} from "../dist/channels/outbox.js";
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
