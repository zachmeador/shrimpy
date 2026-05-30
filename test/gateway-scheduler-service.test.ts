import { beforeEach, afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppRuntime } from "../dist/app/index.js";
import {
  ensureGatewaySchedulesFile,
  loadGatewayAgentSchedules,
} from "../dist/gateway/scheduler-service.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-gateway-scheduler-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("gateway scheduler service", () => {
  test("loads agent-owned schedules with resolved owner ids", () => {
    const runtime = createAppRuntime({
      workspace: testDir,
      agents: [
        { id: "shrimpy", root: "agents/shrimpy" },
        { id: "ops", root: "agents/ops" },
      ],
    });

    mkdirSync(join(testDir, "agents", "shrimpy"), { recursive: true });
    mkdirSync(join(testDir, "agents", "ops"), { recursive: true });
    writeFileSync(
      join(testDir, "agents", "shrimpy", "schedules.json"),
      JSON.stringify([
        {
          id: "heartbeat",
          trigger: { type: "every_ms", everyMs: 1_000 },
          channel: "heartbeat",
          instructions: "check in",
        },
      ]),
      "utf-8",
    );
    writeFileSync(
      join(testDir, "agents", "ops", "schedules.json"),
      JSON.stringify([
        {
          id: "heartbeat",
          trigger: { type: "cron", expression: "0 9 * * *" },
          channel: "ops",
          instructions: "check ops",
        },
      ]),
      "utf-8",
    );

    const schedules = loadGatewayAgentSchedules(runtime);
    assert.deepEqual(
      schedules.map((schedule) => schedule.id),
      ["shrimpy/heartbeat", "ops/heartbeat"],
    );
    assert.equal(schedules[0].ownerAgentId, "shrimpy");
    assert.equal(schedules[1].action.target.addressedAgentId, "ops");
  });

  test("initializes default agent schedules without creating channel config", () => {
    const runtime = createAppRuntime({
      workspace: testDir,
      agents: [
        { id: "shrimpy", root: "agents/shrimpy" },
        { id: "ops", root: "agents/ops" },
      ],
    });

    ensureGatewaySchedulesFile(runtime);

    const shrimpySchedulesPath = join(
      testDir,
      "agents",
      "shrimpy",
      "schedules.json",
    );
    const opsSchedulesPath = join(testDir, "agents", "ops", "schedules.json");
    assert.equal(existsSync(shrimpySchedulesPath), true);
    assert.equal(existsSync(opsSchedulesPath), true);
    assert.equal(existsSync(join(testDir, "config", "channels.json")), false);

    const shrimpySchedules = JSON.parse(readFileSync(shrimpySchedulesPath, "utf-8"));
    const opsSchedules = JSON.parse(readFileSync(opsSchedulesPath, "utf-8"));
    assert.deepEqual(shrimpySchedules.map((schedule: any) => schedule.id), [
      "heartbeat",
      "memory-management",
      "journal-daily",
      "journal-compact",
    ]);
    assert.deepEqual(opsSchedules, []);
  });
});
