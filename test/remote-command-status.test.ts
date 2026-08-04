import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyGatewayRuntimeState,
  saveGatewayRuntimeState,
} from "../dist/gateway/runtime-state.js";
import {
  readGatewayRemoteCommandStatus,
} from "../dist/surfaces/shared/remote-command-status.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-remote-status-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("readGatewayRemoteCommandStatus", () => {
  test("reports a missing lane as idle without creating state", () => {
    const path = join(testDir, "runtime", "gateway-state.json");
    assert.equal(existsSync(path), false);

    assert.deepEqual(readGatewayRemoteCommandStatus(path, {
      agentId: "shrimpy",
      channel: "telegram~main~4242",
    }), {
      lane: {
        phase: "idle",
        queueDepth: 0,
      },
    });
    assert.equal(existsSync(path), false);
  });

  test("reports running and queued lane state without exposing message ids", () => {
    const path = join(testDir, "runtime", "gateway-state.json");
    mkdirSync(join(testDir, "runtime"), { recursive: true });
    const state = emptyGatewayRuntimeState();
    state.lanes.shrimpy = {
      "telegram~main~4242": {
        agentId: "shrimpy",
        channel: "telegram~main~4242",
        queueDepth: 2,
        currentTurn: {
          messageId: "private-message-id",
          startedAt: 10_000,
        },
      },
    };
    saveGatewayRuntimeState(path, state);

    assert.deepEqual(readGatewayRemoteCommandStatus(path, {
      agentId: "shrimpy",
      channel: "telegram~main~4242",
    }), {
      lane: {
        phase: "running",
        queueDepth: 2,
        runningSince: 10_000,
      },
    });
  });

  test("labels only recent errors as recently failed", () => {
    const path = join(testDir, "runtime", "gateway-state.json");
    mkdirSync(join(testDir, "runtime"), { recursive: true });
    const state = emptyGatewayRuntimeState();
    state.lanes.shrimpy = {
      "telegram~main~4242": {
        agentId: "shrimpy",
        channel: "telegram~main~4242",
        queueDepth: 0,
        lastOutcome: {
          messageId: "private-message-id",
          outcome: "errored",
          at: 10_000,
          error: "private provider failure",
        },
      },
    };
    saveGatewayRuntimeState(path, state);

    assert.equal(readGatewayRemoteCommandStatus(path, {
      agentId: "shrimpy",
      channel: "telegram~main~4242",
      now: 20_000,
    }).lane.phase, "recently-failed");
    assert.equal(readGatewayRemoteCommandStatus(path, {
      agentId: "shrimpy",
      channel: "telegram~main~4242",
      now: 2_000_000,
    }).lane.phase, "idle");
  });
});
