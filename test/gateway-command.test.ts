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
import { cmdGateway } from "../dist/commands/gateway.js";

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
});
