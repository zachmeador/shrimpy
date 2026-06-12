import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  detectWorkerBackendAvailability,
  readWorkerBackendAvailability,
  refreshWorkerBackendAvailability,
  writeWorkerBackendAvailability,
} from "../dist/workers/index.js";
import { cmdWorker } from "../dist/commands/worker.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-worker-backends-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("worker backend availability", () => {
  test("detects missing and present external CLIs", () => {
    const state = detectWorkerBackendAvailability({
      now: () => new Date("2026-06-12T12:00:00.000Z"),
      run: (command, args) => {
        if (command === "command" && args[1] === "codex") {
          return { status: 0, stdout: "/usr/bin/codex\n", stderr: "" };
        }
        if (command === "codex") {
          return { status: 0, stdout: "codex 0.139.0\n", stderr: "" };
        }
        return { status: 1, stdout: "", stderr: "" };
      },
    });

    assert.equal(state.checkedAt, "2026-06-12T12:00:00.000Z");
    assert.equal(state.backends.codex.available, true);
    assert.equal(state.backends.codex.path, "/usr/bin/codex");
    assert.equal(state.backends.codex.version, "codex 0.139.0");
    assert.equal(state.backends.codex.authStatus, "unknown");
    assert.equal(state.backends.claude.available, false);
    assert.equal(state.backends.pi.available, true);
  });

  test("persists refreshed availability in workspace state", () => {
    refreshWorkerBackendAvailability(workspace, {
      now: () => new Date("2026-06-12T12:00:00.000Z"),
      run: () => ({ status: 1, stdout: "", stderr: "missing\n" }),
    });

    const state = readWorkerBackendAvailability(workspace);
    assert.equal(state.backends.codex.available, false);
    assert.equal(state.backends.claude.problem, "missing");
    assert.equal(state.backends.pi.authStatus, "configured");
    assert.equal(
      readWorkerBackendAvailability(join(workspace, "missing")).backends.pi.available,
      true,
    );
  });

  test("worker command inspects persisted backend availability as JSON", async () => {
    writeWorkerBackendAvailability(workspace, {
      version: 1,
      checkedAt: "2026-06-12T12:00:00.000Z",
      backends: {
        codex: {
          backend: "codex",
          available: true,
          command: "codex",
          path: "/usr/bin/codex",
          version: "codex 0.139.0",
          authStatus: "unknown",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        claude: {
          backend: "claude",
          available: false,
          command: "claude",
          authStatus: "unavailable",
          checkedAt: "2026-06-12T12:00:00.000Z",
          problem: "command not found",
        },
        pi: {
          backend: "pi",
          available: true,
          authStatus: "configured",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
      },
    });

    const { result, lines } = await captureLogs(() =>
      cmdWorker(["backends", "--json"], { workspace } as any)
    );
    const output = JSON.parse(lines.join("\n"));

    assert.equal(result, 0);
    assert.equal(output.backends.codex.available, true);
    assert.equal(output.backends.claude.problem, "command not found");
  });
});
