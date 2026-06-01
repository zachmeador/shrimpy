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
  inspectSchedules,
  saveSchedulerState,
} from "../dist/scheduler/index.js";

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

  test("rejects missing schedule ids", async () => {
    await setupInit(workspace);

    await assert.rejects(
      () => cmdSchedules(["show", "shrimpy/missing"], { workspace } as any),
      /schedule not found: shrimpy\/missing/,
    );
  });
});
