import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cmdSurface } from "../dist/commands/surface.js";
import { setupInit } from "../dist/setup/init.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-surface-command-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = originalLog;
  }
}

describe("cmdSurface", () => {
  test("lists surface state as JSON", async () => {
    await setupInit(workspace);
    await captureLogs(() =>
      cmdSurface(["set-agent", "telegram", "4242", "shrimpy"], { workspace } as any)
    );

    const { result, lines } = await captureLogs(() =>
      cmdSurface(["--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.deepEqual(JSON.parse(lines.join("\n")), [
      { surface: "telegram", threadId: "4242", addressedAgentId: "shrimpy" },
    ]);
  });

  test("returns structured state changes for set and clear", async () => {
    await setupInit(workspace);

    const setResult = await captureLogs(() =>
      cmdSurface(["set-agent", "telegram", "4242", "shrimpy", "--json"], { workspace } as any)
    );
    assert.equal(setResult.result, 0);
    assert.deepEqual(JSON.parse(setResult.lines.join("\n")), {
      surface: "telegram",
      threadId: "4242",
      addressedAgentId: "shrimpy",
    });

    const clearResult = await captureLogs(() =>
      cmdSurface(["clear-agent", "telegram", "4242", "--json"], { workspace } as any)
    );
    assert.equal(clearResult.result, 0);
    assert.deepEqual(JSON.parse(clearResult.lines.join("\n")), {
      surface: "telegram",
      threadId: "4242",
      addressedAgentId: null,
    });
  });
});
