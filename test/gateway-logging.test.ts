import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installGatewayLogFile } from "../dist/gateway/logging.js";
import { createWorkspacePaths } from "../dist/workspace/paths.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-gateway-logging-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("gateway logging", () => {
  test("workspace paths expose logs dir and gateway log path", () => {
    const paths = createWorkspacePaths(testDir);
    assert.equal(paths.modelsStorePath, join(testDir, "state", "pi", "models-store.json"));
    assert.equal(paths.logsDir, join(testDir, "runtime", "logs"));
    assert.equal(paths.gatewayLogPath, join(testDir, "runtime", "logs", "gateway.log"));
  });

  test("installGatewayLogFile mirrors console output into the gateway log", () => {
    const logPath = join(testDir, "logs", "gateway.log");
    const restore = installGatewayLogFile(logPath);

    try {
      console.log("[gateway] hello from test");
      console.error("[gateway] boom from test");
    } finally {
      restore();
    }

    assert.equal(existsSync(logPath), true);
    const logged = readFileSync(logPath, "utf-8");
    assert.match(logged, /\[info\] \[gateway\] hello from test/);
    assert.match(logged, /\[error\] \[gateway\] boom from test/);
  });
});
