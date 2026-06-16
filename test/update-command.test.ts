import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { cmdUpdate } from "../dist/commands/update.js";
import { loadConfigForWorkspace } from "../dist/config/index.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
  setupInit,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-update-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("cmdUpdate", () => {
  test("reports dry-run preflight as JSON without changing workspace", async () => {
    await setupInit(workspace);
    const config = loadConfigForWorkspace(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdUpdate(["--dry-run", "--json"], config)
    );

    const payload = JSON.parse(lines.join("\n"));
    assert.equal(result, 1);
    assert.equal(payload.dryRun, true);
    assert.equal(payload.workspace, workspace);
    assert.match(payload.install.appRoot, /shrimpy$/);
    assert.deepEqual(payload.protectedPaths.map((path: string) => path.replace(workspace, "$WORKSPACE")), [
      "$WORKSPACE/config/shrimpy.json",
      "$WORKSPACE/state/pi/auth.json",
      "$WORKSPACE/state/pi/models.json",
    ]);
    assert.equal(payload.mechanicModel.agentId, "mechanic");
    assert.equal(payload.mechanicModel.usable, false);
    assert.match(payload.migrationHandoff, /--skill shrimpy-workspace-migration/);
  });

  test("reports unsupported apply mode as a JSON problem", async () => {
    await setupInit(workspace);
    const config = loadConfigForWorkspace(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdUpdate(["--json"], config)
    );

    const payload = JSON.parse(lines.join("\n"));
    assert.equal(result, 1);
    assert.equal(payload.dryRun, false);
    assert.match(payload.problems.join("\n"), /update apply is not implemented yet/);
  });
});
