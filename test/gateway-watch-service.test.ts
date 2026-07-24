import { beforeEach, afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppRuntime } from "../dist/app/runtime.js";
import { setupInit } from "./helpers.ts";
import {
  startGatewayWatchClock,
} from "../dist/gateway/watch-service.js";
import { loadRuntimeAgentWatches } from "../dist/watches/agent-runtime.js";
import type { WatchClock } from "../dist/watches/clock.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-gateway-watch-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("gateway watch service", () => {
  test("loads agent-owned watches with resolved owner ids", () => {
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
      join(testDir, "agents", "shrimpy", "watches.json"),
      JSON.stringify([
        {
          id: "memory-management",
          trigger: { kind: "time", everyMs: 1_000 },
          action: {
            kind: "message",
            channel: "maintenance",
            text: "check in",
          },
        },
      ]),
      "utf-8",
    );
    writeFileSync(
      join(testDir, "agents", "ops", "watches.json"),
      JSON.stringify([
        {
          id: "pulse",
          trigger: { kind: "time", cron: "0 9 * * *" },
          action: {
            kind: "command",
            command: "shrimpy status --json",
            emit: "never",
          },
        },
      ]),
      "utf-8",
    );

    const watches = loadRuntimeAgentWatches(runtime);
    assert.deepEqual(
      watches.map((watch) => watch.id),
      ["shrimpy/memory-management", "ops/pulse"],
    );
    assert.equal(watches[0].ownerAgentId, "shrimpy");
    assert.equal(watches[0].action.kind, "message");
    assert.equal(watches[0].action.addressedAgentId, "shrimpy");
  });

  test("does not create agent watch files when starting the watch clock", () => {
    const runtime = createAppRuntime({
      workspace: testDir,
      agents: [
        { id: "shrimpy", root: "agents/shrimpy" },
        { id: "ops", root: "agents/ops" },
      ],
    });
    mkdirSync(join(testDir, "agents", "shrimpy"), { recursive: true });
    mkdirSync(join(testDir, "agents", "ops"), { recursive: true });

    const clock: WatchClock = startGatewayWatchClock(
      runtime,
      runtime.createChannelBus(),
    );
    clock.stop();

    const shrimpyWatchesPath = join(
      testDir,
      "agents",
      "shrimpy",
      "watches.json",
    );
    const opsWatchesPath = join(testDir, "agents", "ops", "watches.json");
    assert.equal(existsSync(shrimpyWatchesPath), false);
    assert.equal(existsSync(opsWatchesPath), false);
    assert.equal(existsSync(join(testDir, "config", "channels.json")), false);
  });

  test("reloads added and disabled watches without dropping kept clock state", async () => {
    await setupInit(testDir);
    const watchesPath = join(testDir, "agents", "shrimpy", "watches.json");
    writeWatches(watchesPath, [
      {
        id: "kept",
        trigger: { kind: "time", everyMs: 60_000 },
        action: {
          kind: "message",
          channel: "maintenance",
          text: "Keep going.",
        },
      },
    ]);
    const runtime = createAppRuntime({ workspace: testDir });
    const clock: WatchClock = startGatewayWatchClock(
      runtime,
      runtime.createChannelBus(),
    );

    try {
      await waitForState(clock, (state) => state["shrimpy/kept"] !== undefined);
      const keptNextRunAtMs = clock.getState()["shrimpy/kept"]?.nextRunAtMs;
      assert.equal(typeof keptNextRunAtMs, "number");

      writeWatches(watchesPath, [
        {
          id: "kept",
          trigger: { kind: "time", everyMs: 60_000 },
          action: {
            kind: "message",
            channel: "maintenance",
            text: "Keep going.",
          },
        },
        {
          id: "added",
          trigger: { kind: "time", everyMs: 120_000 },
          action: {
            kind: "message",
            channel: "maintenance",
            text: "Added.",
          },
        },
        {
          id: "disabled",
          enabled: false,
          trigger: { kind: "time", everyMs: 120_000 },
          action: {
            kind: "message",
            channel: "maintenance",
            text: "Disabled.",
          },
        },
      ]);

      await waitForState(clock, (state) => state["shrimpy/added"] !== undefined);
      const reloadedState = clock.getState();
      assert.equal(reloadedState["shrimpy/kept"]?.nextRunAtMs, keptNextRunAtMs);
      assert.equal(typeof reloadedState["shrimpy/added"]?.nextRunAtMs, "number");
      assert.equal(reloadedState["shrimpy/disabled"], undefined);
    } finally {
      clock.stop();
    }
  });
});

function writeWatches(path: string, watches: unknown[]): void {
  writeFileSync(path, `${JSON.stringify(watches, null, 2)}\n`, "utf-8");
}

async function waitForState(
  clock: WatchClock,
  predicate: (state: ReturnType<WatchClock["getState"]>) => boolean,
): Promise<void> {
  const deadline = Date.now() + 1_500;
  while (Date.now() < deadline) {
    if (predicate(clock.getState())) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`clock state did not match before timeout: ${JSON.stringify(clock.getState())}`);
}
