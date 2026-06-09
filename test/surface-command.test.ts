import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cmdSurface } from "../dist/commands/surface.js";
import { setupInit } from "../dist/setup/init.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-surface-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

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
