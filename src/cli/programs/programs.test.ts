import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { stopAfter, useRuntimeDir } from "../../lib/testing/index.ts";
import { startProgram } from "./index.ts";

test("a program runs in a process group of its own, so the terminal's Ctrl+C reaches only the command that started it", { timeout: 30_000 }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startProgram(["gateway", "serve"], () => undefined);
  stopAfter(t, async () => {
    await gateway.stop();
  });

  const group = execFileSync("ps", ["-o", "pgid=", "-p", String(gateway.pid)], { encoding: "utf8" });

  assert.equal(Number(group.trim()), gateway.pid);
  assert.notEqual(gateway.pid, process.pid);
});
