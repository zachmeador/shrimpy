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
  collectChannelActivity,
  loadChannelWatchClockSummary,
} from "../dist/channels/activity.js";
import { saveWatchClockState } from "../dist/watches/index.js";

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
      watchId?: string;
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

describe("collectChannelActivity", () => {
  test("tracks watched watch text messages and last user interaction", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    appendAt(channelsDir, "maintenance", {

      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: { transport: "watch", watchId: "shrimpy/memory-management" },
      content: textContent("memory maintenance"),
      timestamp: 1_000,
    });

    // Should not override the watched watch because it is an agent response.
    appendAt(channelsDir, "maintenance", {

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

    const summary = collectChannelActivity(channelsDir, {
      watchedWatches: [{
        label: "memory",
        channel: "maintenance",
        watchId: "shrimpy/memory-management",
      }],
    });
    assert.equal(summary.channelCount, 4);
    assert.equal(summary.lastWatchRun?.channel, "maintenance");
    assert.equal(summary.lastWatchRun?.message.timestamp, 1_000);
    assert.equal(summary.watchedWatches.memory.channel, "maintenance");
    assert.equal(summary.watchedWatches.memory.lastRun?.message.timestamp, 1_000);
    assert.equal(summary.lastUserInteraction?.channel, "local");
    assert.equal(summary.lastUserInteraction?.message.sender.displayName, "CLI");
    assert.equal(summary.lastUserInteraction?.message.timestamp, 5_000);
  });

  test("returns empty summary when channels directory is missing", () => {
    const summary = collectChannelActivity(join(testDir, "missing-channels"));
    assert.equal(summary.channelCount, 0);
    assert.deepEqual(summary.watchedWatches, {});
    assert.equal(summary.lastUserInteraction, undefined);
  });

  test("supports configured non-maintenance watched watch", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    appendAt(channelsDir, "pulse", {

      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: { transport: "watch", watchId: "ops/pulse" },
      content: systemContent({
        trigger: "watch",
        watchId: "ops/pulse",
      }),
      timestamp: 1_000,
    });

    appendAt(channelsDir, "maintenance", {

      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: { transport: "watch", watchId: "shrimpy/memory-management" },
      content: systemContent({
        trigger: "watch",
        watchId: "shrimpy/memory-management",
      }),
      timestamp: 2_000,
    });

    const summary = collectChannelActivity(channelsDir, {
      watchedWatches: [{
        label: "pulse",
        channel: "pulse",
        watchId: "ops/pulse",
      }],
    });

    assert.equal(summary.watchedWatches.pulse.channel, "pulse");
    assert.equal(summary.watchedWatches.pulse.lastRun?.message.timestamp, 1_000);
  });

  test("tracks last watch run across configured watches", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });

    appendAt(channelsDir, "maintenance", {
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: { transport: "watch", watchId: "shrimpy/memory-management" },
      content: textContent("memory maintenance"),
      timestamp: 1_000,
    });
    appendAt(channelsDir, "ops", {
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: { transport: "watch", watchId: "ops/pulse" },
      content: textContent("ops pulse"),
      timestamp: 2_000,
    });
    appendAt(channelsDir, "old", {
      sender: { kind: "system", actorId: "system:watch-runner" },
      origin: { transport: "watch", watchId: "removed/job" },
      content: textContent("old watch job"),
      timestamp: 3_000,
    });

    const summary = collectChannelActivity(
      channelsDir,
      undefined,
      ["shrimpy/memory-management", "ops/pulse"],
    );

    assert.equal(summary.lastWatchRun?.channel, "ops");
    assert.equal(summary.lastWatchRun?.message.origin.watchId, "ops/pulse");
  });
});

describe("loadChannelWatchClockSummary", () => {
  test("reads next watched watch from watch clock state", () => {
    const workspace = join(testDir, "workspace");
    mkdirSync(workspace, { recursive: true });
    const statePath = join(workspace, "watch-clock.json");
    saveWatchClockState(statePath, {
      "shrimpy/memory-management": { nextRunAtMs: 12_345 },
      "custom.watch": { nextRunAtMs: 99_999 },
    });

    const summary = loadChannelWatchClockSummary(
      statePath,
      {
        watchedWatches: [{
          label: "memory",
          channel: "maintenance",
          watchId: "shrimpy/memory-management",
        }],
      },
      ["shrimpy/memory-management"],
    );
    assert.equal(summary.nextWatchRun?.watchId, "shrimpy/memory-management");
    assert.equal(summary.nextWatchRun?.nextRunAtMs, 12_345);
    assert.equal(summary.watchedWatches.memory.nextRunAtMs, 12_345);
  });

  test("returns undefined next run when watch clock state does not exist", () => {
    const summary = loadChannelWatchClockSummary(
      join(testDir, "workspace", "watch-clock.json"),
      {
        watchedWatches: [{
          label: "memory",
          channel: "maintenance",
          watchId: "shrimpy/memory-management",
        }],
      },
      ["shrimpy/memory-management"],
    );
    assert.equal(summary.nextWatchRun, undefined);
    assert.equal(summary.watchedWatches.memory.nextRunAtMs, undefined);
  });

  test("uses configured non-maintenance watch id", () => {
    const workspace = join(testDir, "workspace");
    mkdirSync(workspace, { recursive: true });
    const statePath = join(workspace, "watch-clock.json");
    saveWatchClockState(statePath, {
      "ops/pulse": { nextRunAtMs: 77_777 },
      "shrimpy/memory-management": { nextRunAtMs: 12_345 },
    });

    const summary = loadChannelWatchClockSummary(
      statePath,
      {
        watchedWatches: [{
          label: "pulse",
          channel: "pulse",
          watchId: "ops/pulse",
        }],
      },
      ["ops/pulse"],
    );
    assert.equal(summary.nextWatchRun?.watchId, "ops/pulse");
    assert.equal(summary.watchedWatches.pulse.nextRunAtMs, 77_777);
  });

  test("reads next watch run across configured watches", () => {
    const workspace = join(testDir, "workspace");
    mkdirSync(workspace, { recursive: true });
    const statePath = join(workspace, "watch-clock.json");
    saveWatchClockState(statePath, {
      "removed/job": { nextRunAtMs: 10 },
      "ops/pulse": { nextRunAtMs: 77_777 },
      "shrimpy/memory-management": { nextRunAtMs: 12_345 },
    });

    const summary = loadChannelWatchClockSummary(
      statePath,
      undefined,
      ["shrimpy/memory-management", "ops/pulse"],
    );
    assert.equal(summary.nextWatchRun?.watchId, "shrimpy/memory-management");
    assert.equal(summary.nextWatchRun?.nextRunAtMs, 12_345);
  });
});
