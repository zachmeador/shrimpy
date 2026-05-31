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
  test("tracks watched scheduled text messages and last user interaction", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    appendAt(channelsDir, "heartbeat", {

      sender: { kind: "system", actorId: "system:scheduler" },
      origin: { transport: "scheduler", scheduleId: "shrimpy/heartbeat" },
      content: textContent("scheduled maintenance"),
      timestamp: 1_000,
    });

    // Should not override the watched schedule because it is an agent response.
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

    const summary = collectGatewayActivity(channelsDir, {
      watchedSchedules: [{
        label: "heartbeat",
        channel: "heartbeat",
        scheduleId: "shrimpy/heartbeat",
      }],
    });
    assert.equal(summary.channelCount, 4);
    assert.equal(summary.lastScheduledRun?.channel, "heartbeat");
    assert.equal(summary.lastScheduledRun?.message.timestamp, 1_000);
    assert.equal(summary.watchedSchedules.heartbeat.channel, "heartbeat");
    assert.equal(summary.watchedSchedules.heartbeat.lastRun?.message.timestamp, 1_000);
    assert.equal(summary.lastUserInteraction?.channel, "local");
    assert.equal(summary.lastUserInteraction?.message.sender.displayName, "CLI");
    assert.equal(summary.lastUserInteraction?.message.timestamp, 5_000);
  });

  test("returns empty summary when channels directory is missing", () => {
    const summary = collectGatewayActivity(join(testDir, "missing-channels"));
    assert.equal(summary.channelCount, 0);
    assert.deepEqual(summary.watchedSchedules, {});
    assert.equal(summary.lastUserInteraction, undefined);
  });

  test("supports configured non-heartbeat watched schedule", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    appendAt(channelsDir, "pulse", {

      sender: { kind: "system", actorId: "system:scheduler" },
      origin: { transport: "scheduler", scheduleId: "ops/pulse" },
      content: systemContent({
        trigger: "scheduled",
        scheduleId: "ops/pulse",
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
      watchedSchedules: [{
        label: "pulse",
        channel: "pulse",
        scheduleId: "ops/pulse",
      }],
    });

    assert.equal(summary.watchedSchedules.pulse.channel, "pulse");
    assert.equal(summary.watchedSchedules.pulse.lastRun?.message.timestamp, 1_000);
  });

  test("tracks last scheduled run across configured schedules", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    appendAt(channelsDir, "heartbeat", {
      sender: { kind: "system", actorId: "system:scheduler" },
      origin: { transport: "scheduler", scheduleId: "shrimpy/heartbeat" },
      content: textContent("scheduled maintenance"),
      timestamp: 1_000,
    });
    appendAt(channelsDir, "ops", {
      sender: { kind: "system", actorId: "system:scheduler" },
      origin: { transport: "scheduler", scheduleId: "ops/pulse" },
      content: textContent("scheduled ops"),
      timestamp: 2_000,
    });
    appendAt(channelsDir, "old", {
      sender: { kind: "system", actorId: "system:scheduler" },
      origin: { transport: "scheduler", scheduleId: "removed/job" },
      content: textContent("old scheduled job"),
      timestamp: 3_000,
    });

    const summary = collectGatewayActivity(
      channelsDir,
      undefined,
      ["shrimpy/heartbeat", "ops/pulse"],
    );

    assert.equal(summary.lastScheduledRun?.channel, "ops");
    assert.equal(summary.lastScheduledRun?.message.origin.scheduleId, "ops/pulse");
  });
});

describe("loadGatewaySchedulerSummary", () => {
  test("reads next watched schedule from scheduler state", () => {
    const workspace = join(testDir, "workspace");
    mkdirSync(workspace, { recursive: true });
    const statePath = join(workspace, "scheduler-state.json");
    saveSchedulerState(statePath, {
      "shrimpy/heartbeat": { nextRunAtMs: 12_345 },
      "custom.schedule": { nextRunAtMs: 99_999 },
    });

    const summary = loadGatewaySchedulerSummary(
      statePath,
      {
        watchedSchedules: [{
          label: "heartbeat",
          channel: "heartbeat",
          scheduleId: "shrimpy/heartbeat",
        }],
      },
      ["shrimpy/heartbeat"],
    );
    assert.equal(summary.nextScheduledRun?.scheduleId, "shrimpy/heartbeat");
    assert.equal(summary.nextScheduledRun?.nextRunAtMs, 12_345);
    assert.equal(summary.watchedSchedules.heartbeat.nextRunAtMs, 12_345);
  });

  test("returns undefined next run when scheduler state does not exist", () => {
    const summary = loadGatewaySchedulerSummary(
      join(testDir, "workspace", "scheduler-state.json"),
      {
        watchedSchedules: [{
          label: "heartbeat",
          channel: "heartbeat",
          scheduleId: "shrimpy/heartbeat",
        }],
      },
      ["shrimpy/heartbeat"],
    );
    assert.equal(summary.nextScheduledRun, undefined);
    assert.equal(summary.watchedSchedules.heartbeat.nextRunAtMs, undefined);
  });

  test("uses configured non-heartbeat schedule id", () => {
    const workspace = join(testDir, "workspace");
    mkdirSync(workspace, { recursive: true });
    const statePath = join(workspace, "scheduler-state.json");
    saveSchedulerState(statePath, {
      "ops/pulse": { nextRunAtMs: 77_777 },
      "shrimpy/heartbeat": { nextRunAtMs: 12_345 },
    });

    const summary = loadGatewaySchedulerSummary(
      statePath,
      {
        watchedSchedules: [{
          label: "pulse",
          channel: "pulse",
          scheduleId: "ops/pulse",
        }],
      },
      ["ops/pulse"],
    );
    assert.equal(summary.nextScheduledRun?.scheduleId, "ops/pulse");
    assert.equal(summary.watchedSchedules.pulse.nextRunAtMs, 77_777);
  });

  test("reads next scheduled run across configured schedules", () => {
    const workspace = join(testDir, "workspace");
    mkdirSync(workspace, { recursive: true });
    const statePath = join(workspace, "scheduler-state.json");
    saveSchedulerState(statePath, {
      "removed/job": { nextRunAtMs: 10 },
      "ops/pulse": { nextRunAtMs: 77_777 },
      "shrimpy/heartbeat": { nextRunAtMs: 12_345 },
    });

    const summary = loadGatewaySchedulerSummary(
      statePath,
      undefined,
      ["shrimpy/heartbeat", "ops/pulse"],
    );
    assert.equal(summary.nextScheduledRun?.scheduleId, "shrimpy/heartbeat");
    assert.equal(summary.nextScheduledRun?.nextRunAtMs, 12_345);
  });
});
