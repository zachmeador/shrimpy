import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createScheduler,
  emitChannelTargetRun,
  loadAgentScheduleDefinitions,
  loadScheduleDefinitions,
  parseAgentScheduleDefinitions,
  loadSchedulerState,
  parseScheduleDefinitions,
  resolveAgentScheduleDefinition,
  saveSchedulerState,
  type ScheduleDefinition,
  type ScheduleRunDue,
  type SchedulerStateSnapshot,
} from "../dist/scheduler/index.js";
import {
  createDefaultHeartbeatSchedule,
  createDefaultShrimpySchedules,
} from "../dist/setup/defaults.js";
import { ChannelBus } from "../dist/channels/bus.js";
import { channelPath, readMessages } from "../dist/channels/index.js";
import {
  renderHeartbeatScheduleInstructions,
  renderScheduledTextRun,
} from "../dist/context/index.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-scheduler-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("createDefaultHeartbeatSchedule", () => {
  test("creates an enabled every_ms agent schedule", () => {
    const schedule = createDefaultHeartbeatSchedule({ intervalMs: 5_000 });
    assert.equal(schedule.id, "heartbeat");
    assert.equal(schedule.enabled, true);
    assert.equal(schedule.trigger.type, "every_ms");
    assert.equal(schedule.trigger.everyMs, 5_000);
    assert.equal(schedule.channel, "heartbeat");
    assert.equal(schedule.instructions, renderHeartbeatScheduleInstructions());
  });
});

describe("createDefaultShrimpySchedules", () => {
  test("creates heartbeat and conservative memory upkeep schedules", () => {
    const schedules = createDefaultShrimpySchedules();
    assert.deepEqual(schedules.map((schedule) => schedule.id), [
      "heartbeat",
      "memory-management",
      "journal-daily",
      "journal-compact",
    ]);
    assert.equal(schedules.every((schedule) => schedule.channel === "heartbeat"), true);
    assert.equal(schedules[1].trigger.type, "cron");
    assert.match(schedules[1].instructions, /memory-management/);
    assert.match(schedules[2].instructions, /journal-daily/);
    assert.match(schedules[3].instructions, /journal-compact/);
  });
});

describe("createScheduler", () => {
  test("emits one overdue run and resumes from now", async () => {
    let nowMs = 0;
    const runs: ScheduleRunDue[] = [];

    const schedule: ScheduleDefinition = {
      id: "test.skip",
      trigger: { type: "every_ms", everyMs: 1_000 },
      action: {
        kind: "agent",
        target: { kind: "channel", channel: "heartbeat" },
      },
    };

    const scheduler = createScheduler({
      schedules: [schedule],
      now: () => nowMs,
      onRunDue: async (run) => {
        runs.push(run);
      },
    });

    await scheduler.tick(); // initialize
    assert.equal(runs.length, 0);

    nowMs = 1_000;
    await scheduler.tick();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].fireTimeMs, 1_000);

    nowMs = 3_500;
    await scheduler.tick();
    assert.equal(runs.length, 2);
    assert.equal(runs[1].fireTimeMs, 2_000);
  });

  test("restores next run timing from initial persisted state", async () => {
    let nowMs = 4_500;
    const runs: ScheduleRunDue[] = [];

    const schedule: ScheduleDefinition = {
      id: "test.resume",
      trigger: { type: "every_ms", everyMs: 1_000 },
      action: {
        kind: "agent",
        target: { kind: "channel", channel: "heartbeat" },
      },
    };

    const scheduler = createScheduler({
      schedules: [schedule],
      now: () => nowMs,
      initialState: { "test.resume": { nextRunAtMs: 5_000 } },
      onRunDue: async (run) => {
        runs.push(run);
      },
    });

    await scheduler.tick();
    assert.equal(runs.length, 0);

    nowMs = 5_000;
    await scheduler.tick();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].fireTimeMs, 5_000);
  });

  test("reports state changes through onStateChange", async () => {
    let nowMs = 0;
    const snapshots: SchedulerStateSnapshot[] = [];

    const schedule: ScheduleDefinition = {
      id: "test.state-change",
      trigger: { type: "every_ms", everyMs: 1_000 },
      action: {
        kind: "agent",
        target: { kind: "channel", channel: "heartbeat" },
      },
    };

    const scheduler = createScheduler({
      schedules: [schedule],
      now: () => nowMs,
      onRunDue: async () => {},
      onStateChange: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    await scheduler.tick();
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]["test.state-change"].nextRunAtMs, 1_000);

    nowMs = 500;
    await scheduler.tick();
    assert.equal(snapshots.length, 1);

    nowMs = 1_000;
    await scheduler.tick();
    assert.equal(snapshots.length, 2);
    assert.equal(snapshots[1]["test.state-change"].nextRunAtMs, 2_000);
  });

  test("executes cron schedules in-process with timezone support", async () => {
    let nowMs = Date.parse("2026-04-08T12:59:00.000Z");
    const runs: ScheduleRunDue[] = [];

    const schedule: ScheduleDefinition = {
      id: "test.cron",
      trigger: {
        type: "cron",
        expression: "0 9 * * *",
        timezone: "America/New_York",
      },
      action: {
        kind: "agent",
        target: { kind: "channel", channel: "home" },
      },
    };

    const scheduler = createScheduler({
      schedules: [schedule],
      now: () => nowMs,
      onRunDue: async (run) => {
        runs.push(run);
      },
    });

    await scheduler.tick();
    assert.equal(runs.length, 0);

    nowMs = Date.parse("2026-04-08T13:00:00.000Z");
    await scheduler.tick();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].fireTimeMs, Date.parse("2026-04-08T13:00:00.000Z"));
  });
});

describe("emitChannelTargetRun", () => {
  test("appends run payload to target channel", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });
    const channelBus = new ChannelBus(channelsDir);

    const schedule = resolveAgentScheduleDefinition(
      "shrimpy",
      createDefaultHeartbeatSchedule({ intervalMs: 1_000 }),
    );
    const run: ScheduleRunDue = {
      schedule,
      scheduleId: schedule.id,
      runId: "run-1",
      fireTimeMs: 1_000,
      fireTimeIso: new Date(1_000).toISOString(),
      dedupeKey: `${schedule.id}:${new Date(1_000).toISOString()}`,
    };

    const emitted = emitChannelTargetRun(channelBus, run);
    assert.equal(emitted, true);

    const { messages } = readMessages(channelPath(channelsDir, "heartbeat"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.kind, "system");
    assert.equal(messages[0].sender.actorId, "system:scheduler");
    assert.equal(messages[0].origin.transport, "scheduler");
    assert.equal(messages[0].origin.addressedAgentId, undefined);
    assert.equal(messages[0].origin.schedule?.ownerAgentId, "shrimpy");
    assert.equal(messages[0].origin.schedule?.localId, "heartbeat");
    assert.equal(messages[0].origin.schedule?.targetChannel, "heartbeat");
    assert.deepEqual(messages[0].origin.schedule?.trigger, {
      type: "every_ms",
      everyMs: 1_000,
    });
    assert.deepEqual(messages[0].origin.schedule?.inspect, [
      "shrimpy schedules show shrimpy/heartbeat",
    ]);
    assert.equal(messages[0].content.type, "text");
    assert.equal(messages[0].content.data.scheduleId, undefined);
    assert.equal(messages[0].content.data.text, schedule.action.target.contentData?.text);
    assert.equal(renderScheduledTextRun(run), schedule.action.target.contentData?.text);
  });
});

describe("agent schedule definitions loading", () => {
  test("parses concise agent-owned schedule definitions", () => {
    const schedules = parseAgentScheduleDefinitions([
      {
        id: "heartbeat",
        trigger: { type: "every_ms", everyMs: 5_000 },
        channel: "heartbeat",
        instructions: "check in",
      },
    ]);

    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].id, "heartbeat");
    assert.equal(schedules[0].channel, "heartbeat");
    assert.equal(schedules[0].instructions, "check in");
  });

  test("resolves agent schedules with attention-routed channel targets", () => {
    const schedule = resolveAgentScheduleDefinition("shrimpy", {
      id: "heartbeat",
      trigger: { type: "every_ms", everyMs: 5_000 },
      channel: "heartbeat",
      instructions: "check in",
    });

    assert.equal(schedule.id, "shrimpy/heartbeat");
    assert.equal(schedule.localId, "heartbeat");
    assert.equal(schedule.ownerAgentId, "shrimpy");
    assert.equal(schedule.action.target.channel, "heartbeat");
    assert.equal(schedule.action.target.addressedAgentId, undefined);
    assert.equal(schedule.action.target.contentType, "text");
    assert.deepEqual(schedule.action.target.contentData, { text: "check in" });
  });

  test("loads agent schedules from a json file", () => {
    const schedulesPath = join(testDir, "agent-schedules.json");
    writeFileSync(
      schedulesPath,
      JSON.stringify([
        {
          id: "from.file",
          trigger: { type: "every_ms", everyMs: 7_500 },
          channel: "heartbeat",
          instructions: "check in",
        },
      ]),
      "utf-8",
    );

    const schedules = loadAgentScheduleDefinitions(schedulesPath);
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].id, "from.file");
  });

  test("returns empty when agent schedules file is missing", () => {
    const schedules = loadAgentScheduleDefinitions(join(testDir, "missing-agent.json"));
    assert.deepEqual(schedules, []);
  });
});

describe("emitChannelTargetRun", () => {
  test("appends run payload to target channel for full schedule definitions", () => {
    const channelsDir = join(testDir, "channels");
    mkdirSync(channelsDir, { recursive: true });
    const channelBus = new ChannelBus(channelsDir);

    const schedule: ScheduleDefinition = {
      id: "system.heartbeat",
      trigger: { type: "every_ms", everyMs: 1_000 },
      action: {
        kind: "agent",
        target: {
          kind: "channel",
          channel: "heartbeat",
          senderKind: "system",
          senderActorId: "system:scheduler",
          contentType: "system",
          contentData: { trigger: "scheduled" },
        },
      },
    };
    const run: ScheduleRunDue = {
      schedule,
      scheduleId: schedule.id,
      runId: "run-1",
      fireTimeMs: 1_000,
      fireTimeIso: new Date(1_000).toISOString(),
      dedupeKey: `${schedule.id}:${new Date(1_000).toISOString()}`,
    };

    const emitted = emitChannelTargetRun(channelBus, run);
    assert.equal(emitted, true);

    const { messages } = readMessages(channelPath(channelsDir, "heartbeat"));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].sender.kind, "system");
    assert.equal(messages[0].sender.actorId, "system:scheduler");
    assert.equal(messages[0].origin.transport, "scheduler");
    assert.equal(messages[0].content.type, "system");
    assert.deepEqual(messages[0].content.data, {
      trigger: "scheduled",
      scheduleId: schedule.id,
      runId: "run-1",
      timestamp: new Date(1_000).toISOString(),
    });
  });
});

describe("scheduler state persistence", () => {
  test("saves and loads state from json", () => {
    const path = join(testDir, "scheduler-state.json");
    const state: SchedulerStateSnapshot = {
      "test.a": { nextRunAtMs: 1234 },
      "test.b": { nextRunAtMs: 5678 },
    };

    saveSchedulerState(path, state);
    const loaded = loadSchedulerState(path);
    assert.deepEqual(loaded, state);
  });

  test("load returns empty state on missing file", () => {
    const loaded = loadSchedulerState(join(testDir, "does-not-exist.json"));
    assert.deepEqual(loaded, {});
  });
});

describe("schedule definitions loading", () => {
  test("parses a valid schedules array", () => {
    const schedules = parseScheduleDefinitions([
      {
        id: "test.schedule",
        trigger: { type: "every_ms", everyMs: 5_000 },
        action: {
          kind: "agent",
          target: { kind: "channel", channel: "heartbeat" },
        },
      },
    ]);

    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].id, "test.schedule");
    assert.equal(schedules[0].trigger.type, "every_ms");
    assert.equal(schedules[0].action.kind, "agent");
  });

  test("accepts text channel targets for plain-language scheduler instructions", () => {
    const schedules = parseScheduleDefinitions([
      {
        id: "jobs.weather",
        trigger: { type: "cron", expression: "0 9 * * *" },
        action: {
          kind: "agent",
          target: {
            kind: "channel",
            channel: "telegram~shrimpy~123",
            contentType: "text",
            contentData: { text: "say there is weather today" },
          },
        },
      },
    ]);

    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].action.target.contentType, "text");
  });

  test("rejects duplicate schedule ids", () => {
    assert.throws(
      () =>
        parseScheduleDefinitions([
          {
            id: "dup",
            trigger: { type: "every_ms", everyMs: 1000 },
            action: {
              kind: "agent",
              target: { kind: "channel", channel: "heartbeat" },
            },
          },
          {
            id: "dup",
            trigger: { type: "every_ms", everyMs: 2000 },
            action: {
              kind: "agent",
              target: { kind: "channel", channel: "heartbeat" },
            },
          },
        ]),
      /duplicate id/,
    );
  });

  test("loads schedules from a json file", () => {
    const schedulesPath = join(testDir, "schedules.json");
    writeFileSync(
      schedulesPath,
      JSON.stringify([
        {
          id: "from.file",
          trigger: { type: "every_ms", everyMs: 7_500 },
          action: {
            kind: "agent",
            target: { kind: "channel", channel: "heartbeat" },
          },
        },
      ]),
      "utf-8",
    );

    const schedules = loadScheduleDefinitions(schedulesPath);
    assert.equal(schedules.length, 1);
    assert.equal(schedules[0].id, "from.file");
  });

  test("rejects legacy task targets", () => {
    assert.throws(
      () =>
        parseScheduleDefinitions([
          {
            id: "legacy.task",
            trigger: { type: "every_ms", everyMs: 5_000 },
            action: {
              kind: "agent",
              target: { kind: "task", prompt: "do work" },
            },
          },
        ]),
      /action\.target\.kind must be "channel"/,
    );
  });

  test("rejects removed system task actions", () => {
    assert.throws(
      () =>
        parseScheduleDefinitions([
          {
            id: "legacy.system-task",
            trigger: { type: "every_ms", everyMs: 5_000 },
            action: {
              kind: "system_task",
              task: "consolidate_memory",
            },
          },
        ]),
      /action\.kind must be "agent"/,
    );
  });

  test("returns empty when schedules file is missing", () => {
    const schedules = loadScheduleDefinitions(join(testDir, "missing.json"));
    assert.deepEqual(schedules, []);
  });
});
