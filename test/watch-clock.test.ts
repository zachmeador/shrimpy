import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { computeNextWatchRunAtMs, createWatchClock, watchScheduleKey, type WatchClockStateSnapshot } from "../dist/watches/clock.js";
import { loadWatchClockState, saveWatchClockState } from "../dist/watches/clock-state.js";
import type { ResolvedAgentWatchDefinition, WatchRunDue } from "../dist/watches/schema.js";
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

function persistedClockState(
  watch: ResolvedAgentWatchDefinition,
  nextRunAtMs: number,
  defaultTimezone?: string,
): { nextRunAtMs: number; scheduleKey: string } {
  const scheduleKey = watchScheduleKey(watch, defaultTimezone);
  assert.ok(scheduleKey);
  return { nextRunAtMs, scheduleKey };
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
      initialState: { [watch.id]: persistedClockState(watch, 5_000) },
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
    assert.equal(snapshots[0][watch.id].scheduleKey, watchScheduleKey(watch));

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
        [kept.id]: persistedClockState(kept, 5_000),
        [removed.id]: persistedClockState(removed, 6_000),
      },
      onRunDue: async () => {},
      onStateChange: (snapshot) => snapshots.push(snapshot),
    });

    clock.setWatches([kept, added, disabled], 1_000);

    assert.deepEqual(clock.getState(), {
      [kept.id]: persistedClockState(kept, 5_000),
      [added.id]: persistedClockState(added, 3_000),
    });
    assert.deepEqual(snapshots.at(-1), clock.getState());
  });

  test("prunes removed and disabled clock entries during startup", async () => {
    const snapshots: WatchClockStateSnapshot[] = [];
    const kept = resolvedWatch({ id: "shrimpy/kept", localId: "kept" });
    const removed = resolvedWatch({
      id: "shrimpy/removed",
      localId: "removed",
    });
    const disabled = resolvedWatch({
      id: "shrimpy/disabled",
      localId: "disabled",
      enabled: false,
    });
    const keptState = persistedClockState(kept, 5_000);
    const clock = createWatchClock({
      watches: [kept, disabled],
      initialState: {
        [kept.id]: keptState,
        [removed.id]: persistedClockState(removed, 6_000),
        [disabled.id]: persistedClockState(disabled, 7_000),
      },
      onRunDue: async () => {},
      onStateChange: (snapshot) => snapshots.push(snapshot),
    });

    assert.deepEqual(clock.getState(), { [kept.id]: keptState });
    await clock.tick(0);
    assert.deepEqual(snapshots, [{ [kept.id]: keptState }]);
  });

  test("recomputes next runs only when the effective schedule changes", () => {
    const original = resolvedWatch({
      id: "shrimpy/editable",
      localId: "editable",
      trigger: { kind: "time", everyMs: 1_000 },
    });
    const clock = createWatchClock({
      watches: [original],
      initialState: {
        [original.id]: persistedClockState(original, 5_000),
      },
      onRunDue: async () => {},
    });
    const actionOnlyEdit = resolvedWatch({
      ...original,
      name: "Renamed watch",
      action: {
        kind: "message",
        channel: "maintenance",
        text: "Different action.",
        addressedAgentId: "shrimpy",
      },
    });

    clock.setWatches([actionOnlyEdit], 1_000);
    assert.equal(clock.getState()[original.id]?.nextRunAtMs, 5_000);

    const scheduleEdit = resolvedWatch({
      ...actionOnlyEdit,
      trigger: { kind: "time", everyMs: 2_000 },
    });
    clock.setWatches([scheduleEdit], 1_000);
    assert.deepEqual(
      clock.getState()[original.id],
      persistedClockState(scheduleEdit, 3_000),
    );
  });

  test("recomputes cron watches when explicit or default timezone changes", async () => {
    const explicitUtc = resolvedWatch({
      id: "shrimpy/timezone",
      localId: "timezone",
      trigger: { kind: "time", cron: "0 9 * * *", timezone: "UTC" },
    });
    const previousNextRun = Date.parse("2026-04-09T09:00:00.000Z");
    const clock = createWatchClock({
      watches: [explicitUtc],
      initialState: {
        [explicitUtc.id]: persistedClockState(explicitUtc, previousNextRun),
      },
      onRunDue: async () => {},
    });
    const newYork = resolvedWatch({
      ...explicitUtc,
      trigger: {
        kind: "time",
        cron: "0 9 * * *",
        timezone: "America/New_York",
      },
    });

    clock.setWatches([newYork], Date.parse("2026-04-08T12:59:00.000Z"));
    assert.equal(
      clock.getState()[explicitUtc.id]?.nextRunAtMs,
      Date.parse("2026-04-08T13:00:00.000Z"),
    );

    const expressionEdit = resolvedWatch({
      ...newYork,
      trigger: {
        kind: "time",
        cron: "30 9 * * *",
        timezone: "America/New_York",
      },
    });
    clock.setWatches(
      [expressionEdit],
      Date.parse("2026-04-08T12:59:00.000Z"),
    );
    assert.equal(
      clock.getState()[explicitUtc.id]?.nextRunAtMs,
      Date.parse("2026-04-08T13:30:00.000Z"),
    );

    const inheritedTimezone = resolvedWatch({
      id: "shrimpy/default-timezone",
      localId: "default-timezone",
      trigger: { kind: "time", cron: "0 9 * * *" },
    });
    const utcState = persistedClockState(
      inheritedTimezone,
      previousNextRun,
      "UTC",
    );
    const restarted = createWatchClock({
      watches: [inheritedTimezone],
      defaultTimezone: "America/New_York",
      initialState: { [inheritedTimezone.id]: utcState },
      onRunDue: async () => {},
      now: () => Date.parse("2026-04-08T12:59:00.000Z"),
    });

    await restarted.tick();
    assert.equal(
      restarted.getState()[inheritedTimezone.id]?.nextRunAtMs,
      Date.parse("2026-04-08T13:00:00.000Z"),
    );
  });
});

describe("watch clock state persistence", () => {
  test("round-trips next run timestamps", () => {
    const path = join(testDir, "watch-clock.json");
    const state: WatchClockStateSnapshot = {
      "shrimpy/maintenance": {
        nextRunAtMs: 1_000,
        scheduleKey: JSON.stringify({ kind: "every", everyMs: 1_000 }),
      },
    };

    saveWatchClockState(path, state);
    const loaded = loadWatchClockState(path);
    assert.deepEqual(loaded, state);
  });

  test("drops clock entries without schedule keys", () => {
    const path = join(testDir, "watch-clock.json");
    writeFileSync(
      path,
      `${JSON.stringify({
        "shrimpy/maintenance": { nextRunAtMs: 1_000 },
      })}\n`,
      "utf-8",
    );

    assert.deepEqual(loadWatchClockState(path), {});
  });

  test("returns empty state when missing", () => {
    const loaded = loadWatchClockState(join(testDir, "does-not-exist.json"));
    assert.deepEqual(loaded, {});
  });
});
