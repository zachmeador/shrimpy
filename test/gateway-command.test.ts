import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cmdGateway } from "../dist/commands/gateway/index.js";
import { printGatewayStatus } from "../dist/commands/gateway/status.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-gateway-command-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

async function captureConsole<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; stdout: string[]; stderr: string[] }> {
  const originalLog = console.log;
  const originalError = console.error;
  const stdout: string[] = [];
  const stderr: string[] = [];
  console.log = (...args: unknown[]) => {
    stdout.push(args.map((value) => String(value)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    stderr.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const result = await fn();
    return { result, stdout, stderr };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe("cmdGateway", () => {
  test("prints recent gateway log lines", async () => {
    const logDir = join(workspace, "runtime", "logs");
    mkdirSync(logDir, { recursive: true });
    writeFileSync(
      join(logDir, "gateway.log"),
      ["one", "two", "three", "four"].join("\n") + "\n",
    );

    const { result, stdout, stderr } = await captureConsole(() =>
      cmdGateway(["logs", "--lines", "2"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.deepEqual(stderr, []);
    assert.equal(stdout.join("\n"), "three\nfour");
  });

  test("prints gateway log path", async () => {
    const { result, stdout, stderr } = await captureConsole(() =>
      cmdGateway(["logs", "--path"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.deepEqual(stderr, []);
    assert.equal(stdout.join("\n"), join(workspace, "runtime", "logs", "gateway.log"));
  });

  test("reports missing gateway log", async () => {
    const { result, stdout, stderr } = await captureConsole(() =>
      cmdGateway(["logs"], { workspace } as any)
    );

    assert.equal(result, 1);
    assert.deepEqual(stdout, []);
    assert.match(stderr.join("\n"), /gateway log not found:/);
  });

  test("prints platform service details in gateway status", async () => {
    const service = {
      manager: "launchd" as const,
      serviceName: "io.github.zachmeador.shrimpy.gateway",
      active: "active",
      enabled: "installed",
      definitionPath: "/Users/alice/Library/LaunchAgents/io.github.zachmeador.shrimpy.gateway.plist",
      serviceLogPath: "/Users/alice/Library/Logs/Shrimpy/gateway.launchd.log",
    };

    const { stdout, stderr } = await captureConsole(async () => {
      printGatewayStatus({ workspace } as any, service);
      return 0;
    });

    const output = stdout.join("\n");
    assert.deepEqual(stderr, []);
    assert.match(output, /gateway manager:.*launchd/);
    assert.match(output, /gateway service:.*active/);
    assert.match(output, /gateway enabled:.*installed/);
    assert.match(output, /gateway service file:.*io\.github\.zachmeador\.shrimpy\.gateway\.plist/);
    assert.match(output, /gateway log:.*runtime\/logs\/gateway\.log/);
    assert.match(output, /gateway service log:.*gateway\.launchd\.log/);
    assert.match(output, /runtime warning:.*gateway service is io\.github\.zachmeador\.shrimpy\.gateway/);
  });
});
