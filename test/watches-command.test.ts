import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createAppRuntime } from "../dist/app/index.js";
import { cmdWatches } from "../dist/commands/watches.js";
import { setupInit } from "./helpers.ts";
import {
  inspectWatchHistory,
  inspectWatches,
  loadWatchRunHistory,
  saveWatchClockState,
} from "../dist/watches/index.js";
import { loadRuntimeWatchIds } from "../dist/watches/index.js";
import {
  createChannelSessionKey,
  sessionRootPath,
} from "../dist/sessions/identity.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-watches-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("watch inspection surfaces", () => {
  test("inspects setup-seeded watches with state, run history, and wake policy", async () => {
    await setupInit(workspace);
    const runtime = createAppRuntime({ workspace });
    const future = Date.parse("2030-01-01T00:00:00.000Z");
    saveWatchClockState(runtime.paths.watchClockStatePath, {
      "shrimpy/memory-management": { nextRunAtMs: future },
    });

    const { result: runResult } = await captureLogs(() =>
      cmdWatches([
        "run",
        "shrimpy/memory-management",
        "--json",
      ], { workspace } as any)
    );
    assert.equal(runResult, 0);

    const watches = inspectWatches(runtime);
    const inspected = watches.find((watch) =>
      watch.id === "shrimpy/memory-management"
    );
    assert.ok(inspected);
    assert.equal(inspected.source.kind, "agent");
    assert.equal(inspected.ownerAgentId, "shrimpy");
    assert.equal(inspected.localId, "memory-management");
    assert.deepEqual(inspected.targetChannels, ["maintenance"]);
    assert.deepEqual(inspected.expectedTurnAgentIds, ["shrimpy"]);
    assert.equal(inspected.nextRunAtMs, future);
    assert.equal(inspected.nextRunSource, "clock_state");
    assert.equal(inspected.lastRun?.status, "success");
    assert.equal(inspected.lastRun?.emittedChannelMessageIds.length, 1);
    assert.equal(
      inspected.expectedWake[0]?.sessionPath,
      sessionRootPath(
        join(workspace, "agents", "shrimpy"),
        createChannelSessionKey({ agentId: "shrimpy", channel: "maintenance" }),
      ),
    );

    const { messages } = runtime.createChannelBus().read("maintenance");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.sender.actorId, "system:watch-runner");
    assert.equal(messages[0]?.origin.transport, "watch");
    assert.equal(messages[0]?.origin.watchId, "shrimpy/memory-management");
    assert.equal(messages[0]?.origin.watch?.ownerAgentId, "shrimpy");
    assert.equal(messages[0]?.origin.watch?.localId, "memory-management");
    assert.equal(messages[0]?.origin.watch?.targetChannel, "maintenance");
    assert.deepEqual(messages[0]?.origin.watch?.inspect, [
      "shrimpy watches show shrimpy/memory-management",
      "shrimpy watches history shrimpy/memory-management",
    ]);
  });

  test("lists workspace watches as agent-consumable JSON", async () => {
    await setupInit(workspace);
    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    const { result, lines } = await captureLogs(() =>
      cmdWatches(["--agent", "shrimpy", "--json"], config as any)
    );

    assert.equal(result, 0);
    const payload = JSON.parse(lines.join("\n"));
    assert.deepEqual(
      payload.watches.map((watch: any) => watch.id),
      [
        "shrimpy/memory-management",
        "shrimpy/journal-daily",
        "shrimpy/journal-compact",
      ],
    );
    assert.equal(
      payload.watches.every((watch: any) => watch.ownerAgentId === "shrimpy"),
      true,
    );
    assert.equal(
      payload.watches[0].inspectCommands.watch,
      "shrimpy watches show shrimpy/memory-management",
    );
    assert.deepEqual(payload.watches[0].trigger, {
      kind: "time",
      cron: "0 3 * * *",
    });
    assert.equal(payload.watches[0].enabled, false);
    assert.equal(payload.watches[0].nextRunSource, undefined);
    assert.equal(payload.watches[0].nextRunAtMs, undefined);
  });

  test("toggles an existing watch through the CLI", async () => {
    await setupInit(workspace);

    const enabled = await captureLogs(() =>
      cmdWatches(["enable", "shrimpy/memory-management", "--json"], { workspace } as any)
    );
    assert.equal(enabled.result, 0);
    assert.equal(JSON.parse(enabled.lines.join("\n")).enabled, true);

    const disabled = await captureLogs(() =>
      cmdWatches(["disable", "shrimpy/memory-management", "--json"], { workspace } as any)
    );
    assert.equal(disabled.result, 0);
    assert.equal(JSON.parse(disabled.lines.join("\n")).enabled, false);
  });

  test("shows one resolved watch", async () => {
    await setupInit(workspace);
    const { result, lines } = await captureLogs(() =>
      cmdWatches(["show", "shrimpy/memory-management", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const watch = JSON.parse(lines.join("\n"));
    assert.equal(watch.id, "shrimpy/memory-management");
    assert.equal(watch.localId, "memory-management");
    assert.deepEqual(watch.trigger, { kind: "time", cron: "0 3 * * *" });
    assert.deepEqual(watch.targetChannels, ["maintenance"]);
  });

  test("adds a simple message watch through the CLI", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdWatches([
        "add",
        "morning-note",
        "--agent",
        "shrimpy",
        "--every",
        "5m",
        "--name",
        "Morning note",
        "--concurrency-policy",
        "allow",
        "--channel",
        "maintenance",
        "--message",
        "Check the house.",
        "--json",
      ], { workspace } as any)
    );

    assert.equal(result, 0);
    const watch = JSON.parse(lines.join("\n"));
    assert.equal(watch.id, "shrimpy/morning-note");
    assert.equal(watch.name, "Morning note");
    assert.equal(watch.concurrencyPolicy, "allow");
    assert.deepEqual(watch.trigger, {
      kind: "time",
      everyMs: 300_000,
    });
    assert.deepEqual(watch.targetChannels, ["maintenance"]);
    assert.equal(watch.nextRunSource, "computed");

    const raw = JSON.parse(
      readFileSync(join(workspace, "agents", "shrimpy", "watches.json"), "utf-8"),
    );
    const stored = raw.find((entry: any) => entry.id === "morning-note");
    assert.equal(stored.name, "Morning note");
    assert.equal(stored.timezone, undefined);
    assert.equal(stored.concurrencyPolicy, "allow");
    assert.deepEqual(stored.trigger, { kind: "time", everyMs: 300_000 });
    assert.deepEqual(stored.action, {
      kind: "message",
      channel: "maintenance",
      text: "Check the house.",
    });
  });

  test("rejects invalid watch add values", async () => {
    await setupInit(workspace);

    await assert.rejects(
      () =>
        cmdWatches([
          "add",
          "memory-management",
          "--agent",
          "shrimpy",
          "--every",
          "5m",
          "--channel",
          "maintenance",
          "--message",
          "Check in.",
        ], { workspace } as any),
      /watch already exists: shrimpy\/memory-management/,
    );

    await assert.rejects(
      () =>
        cmdWatches([
          "add",
          "bad-policy",
          "--agent",
          "shrimpy",
          "--every",
          "5m",
          "--concurrency-policy",
          "queue",
          "--channel",
          "maintenance",
          "--message",
          "Check in.",
        ], { workspace } as any),
      /--concurrency-policy must be forbid or allow/,
    );

    await assert.rejects(
      () =>
        cmdWatches([
          "add",
          "timezone-flag",
          "--agent",
          "shrimpy",
          "--every",
          "5m",
          "--timezone",
          "America/New_York",
          "--channel",
          "maintenance",
          "--message",
          "Check in.",
        ], { workspace } as any),
      /Unknown option '--timezone'/,
    );

    await assert.rejects(
      () =>
        cmdWatches([
          "add",
          "bad\u0007id",
          "--agent",
          "shrimpy",
          "--every",
          "5m",
          "--channel",
          "maintenance",
          "--message",
          "Check in.",
        ], { workspace } as any),
      /watch id must not contain control or invisible characters/,
    );

    await assert.rejects(
      () =>
        cmdWatches([
          "add",
          "bad-channel",
          "--agent",
          "shrimpy",
          "--every",
          "5m",
          "--channel",
          "../outside",
          "--message",
          "Check in.",
        ], { workspace } as any),
      /invalid channel name "\.\.\/outside"/,
    );
  });

  test("surfaces human-facing text diagnostics", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdWatches([
        "add",
        "escaped-text",
        "--agent",
        "shrimpy",
        "--every",
        "5m",
        "--channel",
        "maintenance",
        "--message",
        "Don\\'t forget.",
        "--json",
      ], { workspace } as any)
    );

    assert.equal(result, 0);
    const watch = JSON.parse(lines.join("\n"));
    assert.ok(watch.diagnostics.some((diagnostic: string) =>
      diagnostic.includes("literal escaped apostrophe")
    ));
  });

  test("adds a command watch with output emission through the CLI", async () => {
    await setupInit(workspace);

    const { result } = await captureLogs(() =>
      cmdWatches([
        "add",
        "command-add",
        "--agent",
        "shrimpy",
        "--cron",
        "0 9 * * *",
        "--command",
        "printf added",
        "--emit-channel",
        "maintenance",
        "--emit-template",
        "Output: {{stdout}}",
      ], { workspace } as any)
    );

    assert.equal(result, 0);
    const runtime = createAppRuntime({ workspace });
    const watches = inspectWatches(runtime);
    const watch = watches.find((entry) => entry.id === "shrimpy/command-add");
    assert.equal(watch?.actionKind, "command");
    assert.equal(watch?.emitPolicy, "on_output");
    assert.deepEqual(watch?.targetChannels, ["maintenance"]);
  });

  test("rejects emit settings on message watches", async () => {
    await setupInit(workspace);

    await assert.rejects(
      () =>
        cmdWatches([
          "add",
          "bad-message-emit",
          "--agent",
          "shrimpy",
          "--every",
          "5m",
          "--channel",
          "maintenance",
          "--message",
          "Check in.",
          "--emit-channel",
          "maintenance",
        ], { workspace } as any),
      /emit is only supported for command watches/,
    );
  });

  test("runs command watches, emits on output, and keeps history inspectable", async () => {
    await setupInit(workspace);
    writeFileSync(
      join(workspace, "agents", "shrimpy", "watches.json"),
      JSON.stringify([
        {
          id: "command-test",
          trigger: { kind: "time", everyMs: 60_000 },
          action: {
            kind: "command",
            command: "node -e \"console.log([process.env.SHRIMPY_WORKSPACE, process.env.PATH.split(':')[0]].join('|'))\"",
          },
          emit: {
            policy: "on_output",
            channel: "maintenance",
            template: "Command said: {{stdout}}",
          },
        },
      ]),
      "utf-8",
    );
    const config = {
      ...JSON.parse(readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8")),
      workspace,
    };

    const { result: runResult, lines: runLines } = await captureLogs(() =>
      cmdWatches(["run", "shrimpy/command-test", "--json"], config as any)
    );

    assert.equal(runResult, 0);
    const run = JSON.parse(runLines.join("\n"));
    assert.equal(run.status, "success");
    assert.equal(run.observation.kind, "output");
    assert.equal(run.emittedChannelMessageIds.length, 1);

    const runtime = createAppRuntime({ workspace });
    assert.equal(loadRuntimeWatchIds(runtime).includes("shrimpy/command-test"), true);
    assert.equal(loadWatchRunHistory(runtime.paths.runtimeWatchesDir, "shrimpy").length, 1);

    const history = inspectWatchHistory(runtime, "shrimpy/command-test");
    assert.equal(history.length, 1);
    assert.equal(history[0].watchId, "shrimpy/command-test");

    const { messages } = runtime.createChannelBus().read("maintenance");
    assert.equal(messages[0].content.type, "text");
    assert.equal(
      messages[0].content.data.text,
      `Command said: ${workspace}|${join(workspace, "runtime", "bin")}`,
    );
  });

  test("rejects missing watch ids", async () => {
    await setupInit(workspace);

    await assert.rejects(
      () => cmdWatches(["show", "shrimpy/missing"], { workspace } as any),
      /watch not found: shrimpy\/missing/,
    );
  });
});
