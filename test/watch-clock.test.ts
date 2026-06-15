import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  computeNextWatchRunAtMs,
  createWatchClock,
  loadWatchClockState,
  saveWatchClockState,
  type ResolvedAgentWatchDefinition,
  type WatchClockStateSnapshot,
  type WatchRunDue,
} from "../dist/watches/index.js";
import {
  createDefaultShrimpyWatches,
} from "../dist/setup/defaults.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-watch-clock-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function resolvedWatch(
  input: Partial<ResolvedAgentWatchDefinition> = {},
): ResolvedAgentWatchDefinition {
  const localId = input.localId ?? "maintenance";
  return {
    id: input.id ?? `shrimpy/${localId}`,
    ownerAgentId: input.ownerAgentId ?? "shrimpy",
    localId,
    trigger: input.trigger ?? { kind: "time", everyMs: 1_000 },
    action: input.action ?? {
      kind: "message",
      channel: "maintenance",
      text: "Check in.",
      addressedAgentId: "shrimpy",
    },
    ...input,
  };
}

describe("createDefaultShrimpyWatches", () => {
  test("creates explicit maintenance watches without a broad catch-all watch", () => {
    const watches = createDefaultShrimpyWatches();
    assert.deepEqual(watches.map((watch) => watch.id), [
      "memory-management",
      "journal-daily",
      "journal-compact",
    ]);
    assert.equal(watches.every((watch) => watch.enabled === false), true);
    assert.equal(watches.every((watch) => watch.action.kind === "message"), true);
    assert.equal(watches.every((watch: any) => watch.action.channel === "maintenance"), true);
    assert.deepEqual(watches[0].trigger, { kind: "time", cron: "0 3 * * *" });
    assert.match((watches[0].action as any).text, /memory-management/);
    assert.match((watches[1].action as any).text, /journal-daily/);
    assert.match((watches[2].action as any).text, /journal-compact/);
  });
});

describe("createWatchClock", () => {
  test("emits one overdue run and resumes from now", async () => {
    let nowMs = 0;
    const runs: WatchRunDue[] = [];
    const watch = resolvedWatch({
      id: "shrimpy/test.skip",
      localId: "test.skip",
    });

    const clock = createWatchClock({
      watches: [watch],
      now: () => nowMs,
      onRunDue: async (run) => {
        runs.push(run);
      },
    });

    await clock.tick();
    assert.equal(runs.length, 0);

    nowMs = 1_000;
    await clock.tick();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].watchId, watch.id);
    assert.equal(runs[0].fireTimeMs, 1_000);

    nowMs = 3_500;
    await clock.tick();
    assert.equal(runs.length, 2);
    assert.equal(runs[1].fireTimeMs, 2_000);
  });

  test("restores next run timing from initial persisted state", async () => {
    let nowMs = 4_500;
    const runs: WatchRunDue[] = [];
    const watch = resolvedWatch({
      id: "shrimpy/test.resume",
      localId: "test.resume",
    });

    const clock = createWatchClock({
      watches: [watch],
      now: () => nowMs,
      initialState: { [watch.id]: { nextRunAtMs: 5_000 } },
      onRunDue: async (run) => {
        runs.push(run);
      },
    });

    await clock.tick();
    assert.equal(runs.length, 0);

    nowMs = 5_000;
    await clock.tick();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].fireTimeMs, 5_000);
  });

  test("reports state changes through onStateChange", async () => {
    let nowMs = 0;
    const snapshots: WatchClockStateSnapshot[] = [];
    const watch = resolvedWatch({
      id: "shrimpy/test.state-change",
      localId: "test.state-change",
    });

    const clock = createWatchClock({
      watches: [watch],
      now: () => nowMs,
      onRunDue: async () => {},
      onStateChange: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    await clock.tick();
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0][watch.id].nextRunAtMs, 1_000);

    nowMs = 500;
    await clock.tick();
    assert.equal(snapshots.length, 1);

    nowMs = 1_000;
    await clock.tick();
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[1][watch.id].nextRunAtMs, 2_000);
  });

  test("executes cron watches in-process with timezone support", async () => {
    let nowMs = Date.parse("2026-04-08T12:59:00.000Z");
    const runs: WatchRunDue[] = [];
    const watch = resolvedWatch({
      id: "shrimpy/test.cron",
      localId: "test.cron",
      trigger: {
        kind: "time",
        cron: "0 9 * * *",
        timezone: "America/New_York",
      },
    });

    const clock = createWatchClock({
      watches: [watch],
      now: () => nowMs,
      onRunDue: async (run) => {
        runs.push(run);
      },
    });

    await clock.tick();
    assert.equal(runs.length, 0);

    nowMs = Date.parse("2026-04-08T13:00:00.000Z");
    await clock.tick();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].fireTimeMs, Date.parse("2026-04-08T13:00:00.000Z"));
  });

  test("computes fallback next runs with timezone support", () => {
    const watch = resolvedWatch({
      id: "shrimpy/test.compute",
      localId: "test.compute",
      trigger: {
        kind: "time",
        cron: "0 9 * * *",
      },
      timezone: "America/New_York",
    });

    assert.equal(
      computeNextWatchRunAtMs(
        watch,
        Date.parse("2026-04-08T12:59:00.000Z"),
      ),
      Date.parse("2026-04-08T13:00:00.000Z"),
    );
  });

  test("reloads watch definitions while preserving and pruning clock state", () => {
    const snapshots: WatchClockStateSnapshot[] = [];
    const kept = resolvedWatch({
      id: "shrimpy/kept",
      localId: "kept",
    });
    const removed = resolvedWatch({
      id: "shrimpy/removed",
      localId: "removed",
    });
    const added = resolvedWatch({
      id: "shrimpy/added",
      localId: "added",
      trigger: { kind: "time", everyMs: 2_000 },
    });
    const disabled = resolvedWatch({
      id: "shrimpy/disabled",
      localId: "disabled",
      enabled: false,
    });
    const clock = createWatchClock({
      watches: [kept, removed],
      now: () => 0,
      initialState: {
        [kept.id]: { nextRunAtMs: 5_000 },
        [removed.id]: { nextRunAtMs: 6_000 },
      },
      onRunDue: async () => {},
      onStateChange: (snapshot) => snapshots.push(snapshot),
    });

    clock.setWatches([kept, added, disabled], 1_000);

    assert.deepEqual(clock.getState(), {
      [kept.id]: { nextRunAtMs: 5_000 },
      [added.id]: { nextRunAtMs: 3_000 },
    });
    assert.deepEqual(snapshots.at(-1), clock.getState());
  });

});

describe("watch clock state persistence", () => {
  test("round-trips next run timestamps", () => {
    const path = join(testDir, "watch-clock.json");
    const state: WatchClockStateSnapshot = {
      "shrimpy/maintenance": { nextRunAtMs: 1_000 },
    };

    saveWatchClockState(path, state);
    const loaded = loadWatchClockState(path);
    assert.deepEqual(loaded, state);
  });

  test("returns empty state when missing", () => {
    const loaded = loadWatchClockState(join(testDir, "does-not-exist.json"));
    assert.deepEqual(loaded, {});
  });
});
