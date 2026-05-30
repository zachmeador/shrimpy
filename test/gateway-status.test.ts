import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  appendMessage,
  channelPath,
  textContent,
  systemContent,
  type MessageContent,
} from "../dist/channels/index.js";
import {
  collectGatewayActivity,
  loadGatewaySchedulerSummary,
} from "../dist/gateway/status.js";
import { saveSchedulerState } from "../dist/scheduler/index.js";

let testDir: string;
let idCounter = 0;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-gateway-status-test-"));
  idCounter = 0;
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function appendAt(
  channelsDir: string,
  channel: string,
  opts: {
    sender: {
      kind: "human" | "agent" | "system";
      actorId: string;
      userId?: string;
      displayName?: string;
    };
    origin: {
      transport: string;
      scheduleId?: string;
    };
    content: MessageContent;
    timestamp: number;
  },
) {
  appendMessage(channelPath(channelsDir, channel), {
    id: `msg-${++idCounter}`,
    sender: opts.sender,
    origin: opts.origin,
    content: opts.content,
    timestamp: opts.timestamp,
  });
}

describe("collectGatewayActivity", () => {
  test("tracks scheduled heartbeat and last user interaction", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    appendAt(channelsDir, "heartbeat", {

      sender: { kind: "system", actorId: "system:scheduler" },
      origin: { transport: "scheduler", scheduleId: "shrimpy/heartbeat" },
      content: systemContent({ trigger: "scheduled" }),
      timestamp: 1_000,
    });

    // Should not override last heartbeat because it is an agent message.
    appendAt(channelsDir, "heartbeat", {

      sender: { kind: "agent", actorId: "agent:shrimpy" },
      origin: { transport: "internal" },
      content: textContent("done"),
      timestamp: 2_000,
    });

    appendAt(channelsDir, "telegram-42", {

      sender: {
        kind: "human",
        actorId: "human:user:alice",
        userId: "user:alice",
        displayName: "alice",
      },
      origin: { transport: "telegram" },
      content: textContent("hello"),
      timestamp: 3_000,
    });

    // Should be ignored as user interaction because sender is system.
    appendAt(channelsDir, "alerts", {

      sender: { kind: "system", actorId: "system:maintenance" },
      origin: { transport: "internal" },
      content: systemContent({ event: "maintenance" }),
      timestamp: 4_000,
    });

    appendAt(channelsDir, "local", {

      sender: {
        kind: "human",
        actorId: "human:user:cli",
        userId: "user:cli",
        displayName: "CLI",
      },
      origin: { transport: "cli" },
      content: textContent("run cleanup"),
      timestamp: 5_000,
    });

    const summary = collectGatewayActivity(channelsDir);
    assert.equal(summary.channelCount, 4);
    assert.equal(summary.lastHeartbeat?.channel, "heartbeat");
    assert.equal(summary.lastHeartbeat?.message.timestamp, 1_000);
    assert.equal(summary.lastUserInteraction?.channel, "local");
    assert.equal(summary.lastUserInteraction?.message.sender.displayName, "CLI");
    assert.equal(summary.lastUserInteraction?.message.timestamp, 5_000);
  });

  test("returns empty summary when channels directory is missing", () => {
    const summary = collectGatewayActivity(join(testDir, "missing-channels"));
    assert.equal(summary.channelCount, 0);
    assert.equal(summary.lastHeartbeat, undefined);
    assert.equal(summary.lastUserInteraction, undefined);
  });

  test("supports configured heartbeat channel and schedule id", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    appendAt(channelsDir, "pulse", {

      sender: { kind: "system", actorId: "system:scheduler" },
      origin: { transport: "scheduler", scheduleId: "ops.pulse" },
      content: systemContent({
        trigger: "scheduled",
        scheduleId: "ops.pulse",
      }),
      timestamp: 1_000,
    });

    appendAt(channelsDir, "heartbeat", {

      sender: { kind: "system", actorId: "system:scheduler" },
      origin: { transport: "scheduler", scheduleId: "shrimpy/heartbeat" },
      content: systemContent({
        trigger: "scheduled",
        scheduleId: "shrimpy/heartbeat",
      }),
      timestamp: 2_000,
    });

    const summary = collectGatewayActivity(channelsDir, {
      heartbeatChannel: "pulse",
      heartbeatScheduleId: "ops.pulse",
    });

    assert.equal(summary.lastHeartbeat?.channel, "pulse");
    assert.equal(summary.lastHeartbeat?.message.timestamp, 1_000);
  });
});

describe("loadGatewaySchedulerSummary", () => {
  test("reads next heartbeat from scheduler state", () => {
    const workspace = join(testDir, "workspace");
    mkdirSync(workspace, { recursive: true });
    const statePath = join(workspace, "scheduler-state.json");
    saveSchedulerState(statePath, {
      "shrimpy/heartbeat": { nextRunAtMs: 12_345 },
      "custom.schedule": { nextRunAtMs: 99_999 },
    });

    const summary = loadGatewaySchedulerSummary(statePath);
    assert.equal(summary.nextHeartbeatAtMs, 12_345);
  });

  test("returns undefined heartbeat when scheduler state does not exist", () => {
    const summary = loadGatewaySchedulerSummary(
      join(testDir, "workspace", "scheduler-state.json"),
    );
    assert.equal(summary.nextHeartbeatAtMs, undefined);
  });

  test("uses configured heartbeat schedule id", () => {
    const workspace = join(testDir, "workspace");
    mkdirSync(workspace, { recursive: true });
    const statePath = join(workspace, "scheduler-state.json");
    saveSchedulerState(statePath, {
      "ops.pulse": { nextRunAtMs: 77_777 },
      "shrimpy/heartbeat": { nextRunAtMs: 12_345 },
    });

    const summary = loadGatewaySchedulerSummary(statePath, {
      heartbeatScheduleId: "ops.pulse",
    });
    assert.equal(summary.nextHeartbeatAtMs, 77_777);
  });
});
