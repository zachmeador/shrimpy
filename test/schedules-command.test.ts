import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppRuntime } from "../dist/app/index.js";
import { cmdSchedules } from "../dist/commands/schedules.js";
import { setupInit } from "../dist/setup.js";
import {
  emitChannelTargetRun,
  drainDueOneTimeSchedules,
  inspectSchedules,
  inspectOneTimeSchedules,
  loadOneTimeScheduleStore,
  saveSchedulerState,
} from "../dist/scheduler/index.js";
import { loadGatewayScheduleIds } from "../dist/gateway/scheduler-service.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-schedules-command-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = originalLog;
  }
}

describe("schedule inspection surfaces", () => {
  test("inspects agent schedules with state, channel logs, and attention", async () => {
    await setupInit(workspace);
    const runtime = createAppRuntime({ workspace });
    const future = Date.parse("2030-01-01T00:00:00.000Z");
    saveSchedulerState(runtime.paths.schedulerStatePath, {
      "shrimpy/heartbeat": { nextRunAtMs: future },
    });

    const heartbeat = inspectSchedules(runtime)
      .find((schedule) => schedule.id === "shrimpy/heartbeat");
    assert.ok(heartbeat);
    const fireTimeMs = Date.parse("2026-05-01T10:00:00.000Z");
    emitChannelTargetRun(runtime.createChannelBus(), {
      schedule: heartbeat.schedule,
      scheduleId: heartbeat.id,
      runId: "run-1",
      fireTimeMs,
      fireTimeIso: new Date(fireTimeMs).toISOString(),
      dedupeKey: `${heartbeat.id}:${fireTimeMs}`,
    });

    const schedules = inspectSchedules(runtime);
    const inspected = schedules.find((schedule) =>
      schedule.id === "shrimpy/heartbeat"
    );
    assert.ok(inspected);
    assert.equal(inspected.source.kind, "agent");
    assert.equal(inspected.ownerAgentId, "shrimpy");
    assert.equal(inspected.localId, "heartbeat");
    assert.equal(inspected.targetChannel, "heartbeat");
    assert.deepEqual(inspected.channelMembership.agentIds, ["shrimpy"]);
    assert.deepEqual(inspected.expectedTurnAgentIds, ["shrimpy"]);
    assert.equal(inspected.nextRunAtMs, future);
    assert.equal(inspected.lastObservedRun?.runId, "run-1");
    assert.equal(inspected.recentEmittedMessageId, inspected.lastObservedRun?.messageId);
    assert.match(inspected.expectedAttention[0]?.sessionPath ?? "", /agents\/shrimpy\/sessions\/heartbeat$/);
    assert.deepEqual(inspected.diagnostics, []);

    const { messages } = runtime.createChannelBus().read("heartbeat");
    assert.equal(messages[0]?.origin.schedule?.ownerAgentId, "shrimpy");
    assert.equal(messages[0]?.origin.schedule?.localId, "heartbeat");
    assert.equal(messages[0]?.origin.schedule?.targetChannel, "heartbeat");
    assert.deepEqual(messages[0]?.origin.schedule?.inspect, [
      "shrimpy schedules show shrimpy/heartbeat",
    ]);
  });

  test("lists workspace schedules as agent-consumable JSON", async () => {
    await setupInit(workspace);
    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    const { result, lines } = await captureLogs(() =>
      cmdSchedules(["--agent", "shrimpy", "--json"], config as any)
    );

    assert.equal(result, 0);
    const payload = JSON.parse(lines.join("\n"));
    assert.deepEqual(
      payload.schedules.map((schedule: any) => schedule.id),
      [
        "shrimpy/heartbeat",
        "shrimpy/memory-management",
        "shrimpy/journal-daily",
        "shrimpy/journal-compact",
      ],
    );
    assert.equal(
      payload.schedules.every((schedule: any) => schedule.ownerAgentId === "shrimpy"),
      true,
    );
    assert.equal(payload.schedules[0].inspectCommands.schedule, "shrimpy schedules show shrimpy/heartbeat");
  });

  test("includes workspace-level schedules and missing attention diagnostics", async () => {
    await setupInit(workspace);
    writeFileSync(
      join(workspace, "config", "schedules.json"),
      JSON.stringify([
        {
          id: "ops-daily",
          trigger: { type: "cron", expression: "0 9 * * *" },
          action: {
            kind: "agent",
            target: {
              kind: "channel",
              channel: "ops",
              contentType: "system",
              contentData: { task: "daily ops check" },
            },
          },
        },
      ]),
      "utf-8",
    );
    const runtime = createAppRuntime({ workspace });

    const inspected = inspectSchedules(runtime).find((schedule) =>
      schedule.id === "ops-daily"
    );
    assert.ok(inspected);
    assert.equal(inspected.source.kind, "system");
    assert.equal(inspected.ownerAgentId, undefined);
    assert.equal(inspected.channelMembership.exists, false);
    assert.deepEqual(inspected.expectedTurnAgentIds, []);
    assert.ok(
      inspected.diagnostics.includes("target channel ops has no explicit membership"),
    );
    assert.ok(
      inspected.diagnostics.includes(
        "no configured agent is expected to take a turn from this scheduled message",
      ),
    );
  });

  test("shows one resolved schedule", async () => {
    await setupInit(workspace);
    const { result, lines } = await captureLogs(() =>
      cmdSchedules(["show", "shrimpy/heartbeat", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const schedule = JSON.parse(lines.join("\n"));
    assert.equal(schedule.id, "shrimpy/heartbeat");
    assert.equal(schedule.localId, "heartbeat");
    assert.equal(schedule.targetChannel, "heartbeat");
  });

  test("creates, lists, shows, and cancels one-time schedules from CLI", async () => {
    await setupInit(workspace);
    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    const { result: createResult, lines: createLines } = await captureLogs(() =>
      cmdSchedules([
        "once",
        "--id",
        "once-cli-test",
        "--at",
        "2030-01-01T00:00:00.000Z",
        "--channel",
        "heartbeat",
        "--text",
        "check this later",
        "--agent",
        "shrimpy",
        "--json",
      ], config as any)
    );

    assert.equal(createResult, 0);
    const created = JSON.parse(createLines.join("\n"));
    assert.equal(created.kind, "one_time");
    assert.equal(created.id, "once-cli-test");
    assert.equal(created.status, "pending");
    assert.equal(created.ownerAgentId, "shrimpy");
    assert.equal(created.targetChannel, "heartbeat");
    assert.equal(created.text, "check this later");
    assert.deepEqual(created.expectedTurnAgentIds, ["shrimpy"]);
    assert.equal(created.inspectCommands.cancel, "shrimpy schedules cancel once-cli-test");

    const runtime = createAppRuntime({ workspace });
    assert.deepEqual(
      inspectOneTimeSchedules(runtime).map((schedule) => schedule.id),
      ["once-cli-test"],
    );
    assert.equal(loadGatewayScheduleIds(runtime).includes("once-cli-test"), true);

    const { lines: listLines } = await captureLogs(() =>
      cmdSchedules(["list", "--one-time", "--json"], config as any)
    );
    const listed = JSON.parse(listLines.join("\n"));
    assert.deepEqual(
      listed.oneTimeSchedules.map((schedule: any) => schedule.id),
      ["once-cli-test"],
    );

    const { lines: showLines } = await captureLogs(() =>
      cmdSchedules(["show", "once-cli-test", "--json"], config as any)
    );
    const shown = JSON.parse(showLines.join("\n"));
    assert.equal(shown.id, "once-cli-test");
    assert.equal(shown.dueAtIso, "2030-01-01T00:00:00.000Z");

    const { result: cancelResult, lines: cancelLines } = await captureLogs(() =>
      cmdSchedules(["cancel", "once-cli-test", "--json"], config as any)
    );
    assert.equal(cancelResult, 0);
    const cancelled = JSON.parse(cancelLines.join("\n"));
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.inspectCommands.cancel, undefined);
  });

  test("fires due one-time schedules and keeps fired records inspectable", async () => {
    await setupInit(workspace);
    const runtime = createAppRuntime({ workspace });
    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    await captureLogs(() =>
      cmdSchedules([
        "once",
        "--id",
        "once-due-test",
        "--at",
        "2026-05-01T10:00:00.000Z",
        "--channel",
        "heartbeat",
        "--text",
        "scheduled follow-up",
        "--agent",
        "shrimpy",
      ], config as any)
    );

    const fired = drainDueOneTimeSchedules({
      storePath: runtime.paths.oneTimeSchedulesPath,
      channelBus: runtime.createChannelBus(),
      nowMs: Date.parse("2026-05-01T10:00:01.000Z"),
    });

    assert.equal(fired.length, 1);
    const store = loadOneTimeScheduleStore(runtime.paths.oneTimeSchedulesPath);
    assert.equal(store.records[0].status, "fired");
    assert.equal(typeof store.records[0].emittedChannelMessageId, "string");

    const inspected = inspectOneTimeSchedules(runtime)[0];
    assert.equal(inspected.id, "once-due-test");
    assert.equal(inspected.status, "fired");
    assert.equal(inspected.emittedChannelMessageId, store.records[0].emittedChannelMessageId);
    assert.equal(inspected.diagnostics.includes("fired one-time schedule has no emitted channel message id"), false);

    const { messages } = runtime.createChannelBus().read("heartbeat");
    const message = messages.find((candidate) =>
      candidate.id === inspected.emittedChannelMessageId
    );
    assert.ok(message);
    assert.equal(message.origin.schedule?.kind, "one_time");
    assert.equal(message.origin.schedule?.targetChannel, "heartbeat");
    assert.equal(message.content.type, "text");
    assert.equal(message.content.data.text, "scheduled follow-up");
  });

  test("rejects missing schedule ids", async () => {
    await setupInit(workspace);

    await assert.rejects(
      () => cmdSchedules(["show", "shrimpy/missing"], { workspace } as any),
      /schedule not found: shrimpy\/missing/,
    );
  });
});
