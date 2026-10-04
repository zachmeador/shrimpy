import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  findRunningGatewayPid,
  isAlive,
  isGatewayProcess,
  readPidFile,
  removePidFile,
  writePidFile,
} from "../dist/gateway/pid-file.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "shrimpy-pid-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("gateway pid file utilities", () => {
  test("readPidFile returns null when file does not exist", () => {
    assert.equal(readPidFile(join(tmp, "missing.pid")), null);
  });

  test("read/write round-trip", () => {
    const path = join(tmp, "gateway.pid");
    writePidFile(path, 12345);
    assert.equal(readPidFile(path), 12345);
  });

  test("readPidFile rejects non-numeric content", () => {
    const path = join(tmp, "gateway.pid");
    writePidFile(path, NaN as unknown as number);
    assert.equal(readPidFile(path), null);
  });

  test("removePidFile is a no-op when the file does not exist", () => {
    removePidFile(join(tmp, "missing.pid"));
  });

  test("isAlive recognises this process and rejects clearly-dead pids", () => {
    assert.equal(isAlive(process.pid), true);
    assert.equal(isAlive(0), false);
    assert.equal(isAlive(-1), false);
    assert.equal(isAlive(2_147_483_640), false);
  });

  test("isGatewayProcess returns false for the test process", () => {
    assert.equal(isGatewayProcess(process.pid), false);
  });

  test("findRunningGatewayPid clears stale pid files", () => {
    const path = join(tmp, "gateway.pid");
    writePidFile(path, 2_147_483_640);
    assert.equal(findRunningGatewayPid(path), null);
    assert.equal(existsSync(path), false);
  });

  test("findRunningGatewayPid clears pid files pointing at non-gateway processes", () => {
    const path = join(tmp, "gateway.pid");
    writePidFile(path, process.pid);
    assert.equal(findRunningGatewayPid(path), null);
    assert.equal(existsSync(path), false);
  });
});
