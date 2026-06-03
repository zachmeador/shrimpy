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
  ensureGatewayWatchFiles,
  loadGatewayAgentWatches,
} from "../dist/gateway/watch-service.js";

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

    const watches = loadGatewayAgentWatches(runtime);
    assert.deepEqual(
      watches.map((watch) => watch.id),
      ["shrimpy/memory-management", "ops/pulse"],
    );
    assert.equal(watches[0].ownerAgentId, "shrimpy");
    assert.equal(watches[0].action.kind, "message");
    assert.equal(watches[0].action.addressedAgentId, "shrimpy");
  });

  test("initializes default agent watches without creating channel config", () => {
    const runtime = createAppRuntime({
      workspace: testDir,
      agents: [
        { id: "shrimpy", root: "agents/shrimpy" },
        { id: "ops", root: "agents/ops" },
      ],
    });

    ensureGatewayWatchFiles(runtime);

    const shrimpyWatchesPath = join(
      testDir,
      "agents",
      "shrimpy",
      "watches.json",
    );
    const opsWatchesPath = join(testDir, "agents", "ops", "watches.json");
    assert.equal(existsSync(shrimpyWatchesPath), true);
    assert.equal(existsSync(opsWatchesPath), true);
    assert.equal(existsSync(join(testDir, "config", "channels.json")), false);

    const shrimpyWatches = JSON.parse(readFileSync(shrimpyWatchesPath, "utf-8"));
    const opsWatches = JSON.parse(readFileSync(opsWatchesPath, "utf-8"));
    assert.deepEqual(shrimpyWatches.map((watch: any) => watch.id), [
      "memory-management",
      "journal-daily",
      "journal-compact",
    ]);
    assert.deepEqual(opsWatches, []);
  });
});
