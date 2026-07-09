import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  claimGatewayPid,
  GatewayAlreadyRunningError,
  releaseGatewayPid,
} from "../dist/gateway/pid-file.js";
import {
  collectGatewayLiveness,
  GatewayHealthWriter,
} from "../dist/gateway/liveness.js";

let root: string;

beforeEach(() => { root = mkdtempSync(join(tmpdir(), "shrimpy-gateway-liveness-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const service = {
  manager: "launchd" as const,
  serviceName: "gateway",
  active: "inactive",
  enabled: "installed",
};

describe("gateway ownership and liveness", () => {
  test("claims exclusively and refuses a live gateway owner", () => {
    const pidPath = join(root, "runtime", "gateway.pid");
    claimGatewayPid(pidPath, {
      pid: 101,
      isAlive: (pid) => pid === 101,
      command: () => "/usr/local/bin/node /app/dist/gateway.js",
    });
    assert.throws(
      () => claimGatewayPid(pidPath, {
        pid: 202,
        isAlive: () => true,
        command: () => "/usr/local/bin/node /app/dist/gateway.js",
      }),
      (error: unknown) => error instanceof GatewayAlreadyRunningError && error.pid === 101,
    );
    assert.equal(readFileSync(pidPath, "utf-8"), "101\n");
  });

  test("release never removes a newer owner's claim", () => {
    const pidPath = join(root, "gateway.pid");
    claimGatewayPid(pidPath, { pid: 101, isAlive: () => false });
    writeFileSync(pidPath, "202\n");
    assert.equal(releaseGatewayPid(pidPath, 101), false);
    assert.equal(readFileSync(pidPath, "utf-8"), "202\n");
  });

  test("fresh and stale heartbeat states are explicit and service state is separate", () => {
    const pidPath = join(root, "gateway.pid");
    const healthPath = join(root, "gateway-health.json");
    claimGatewayPid(pidPath, { pid: 101, isAlive: () => true, command: () => "node /app/gateway.js" });
    const writer = new GatewayHealthWriter(healthPath, {
      pid: 101,
      workspace: "/workspace",
      appCheckout: "/app",
    });
    writer.beat();
    const fresh = collectGatewayLiveness({
      pidPath,
      healthPath,
      workspace: "/workspace",
      appCheckout: "/app",
      service,
      now: Date.now(),
      lookup: { isAlive: () => true, command: () => "node /app/gateway.js" },
    });
    assert.equal(fresh.process, "running");
    assert.equal(fresh.heartbeat, "fresh");
    assert.equal(fresh.managementMismatch, true);
    assert.equal(fresh.warnings.some((warning) => warning.includes("running while")), true);

    const stale = collectGatewayLiveness({
      pidPath,
      healthPath,
      workspace: "/workspace",
      appCheckout: "/app",
      service,
      now: Date.now() + 20_000,
      lookup: { isAlive: () => true, command: () => "node /app/gateway.js" },
    });
    assert.equal(stale.process, "stale");
    assert.equal(stale.heartbeat, "stale");
  });
});
