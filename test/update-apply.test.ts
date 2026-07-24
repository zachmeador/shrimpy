import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  readShrimpyInstallMetadata,
  writeShrimpyInstallMetadata,
} from "../dist/app/install-metadata.js";
import { applyTaggedRelease } from "../dist/update/apply.js";
import {
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let root: string;
let appRoot: string;
let workspace: string;
const oldCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const newCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

beforeEach(() => {
  root = makeTempWorkspace("shrimpy-update-apply-test-");
  appRoot = join(root, "app");
  workspace = join(root, "workspace");
  mkdirSync(appRoot, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(appRoot, "version.txt"), "old", "utf-8");
  writeShrimpyInstallMetadata(appRoot, {
    origin: "https://example.test/shrimpy.git",
    requestedRef: "v0.5.0",
    installedRef: "v0.5.0",
    installedCommit: oldCommit,
  });
});

afterEach(() => {
  removeTempWorkspace(root);
});

describe("tagged app swap", () => {
  test("installs the staged app and updates managed metadata after the mechanic check", () => {
    const checked: string[] = [];
    const result = applyTaggedRelease(applyInput(), {
      stageRelease: () => createStage("new"),
      checkMechanic: (cliPath) => {
        checked.push(readFileSync(join(appRoot, "version.txt"), "utf-8"));
        assert.equal(cliPath, join(appRoot, "dist", "cli.js"));
      },
      withLock: (_path, operation) => operation(),
    });

    assert.equal(result.tag, "v0.6.0");
    assert.equal(result.mechanicCheck, "passed");
    assert.deepEqual(checked, ["new"]);
    assert.equal(readFileSync(join(appRoot, "version.txt"), "utf-8"), "new");
    assert.equal(readShrimpyInstallMetadata(appRoot)?.installedRef, "v0.6.0");
    assert.equal(readShrimpyInstallMetadata(appRoot)?.requestedRef, "v0.6.0");
    assert.equal(readShrimpyInstallMetadata(appRoot)?.installedCommit, newCommit);
  });

  test("restores the previous app when the new mechanic check fails", () => {
    const checked: string[] = [];
    assert.throws(
      () => applyTaggedRelease(applyInput(), {
        stageRelease: () => createStage("broken"),
        checkMechanic: () => {
          const version = readFileSync(join(appRoot, "version.txt"), "utf-8");
          checked.push(version);
          if (version === "broken") throw new Error("TUI construction failed");
        },
        withLock: (_path, operation) => operation(),
      }),
      /restored v0\.5\.0: TUI construction failed/,
    );

    assert.deepEqual(checked, ["broken", "old"]);
    assert.equal(readFileSync(join(appRoot, "version.txt"), "utf-8"), "old");
    assert.equal(readShrimpyInstallMetadata(appRoot)?.installedRef, "v0.5.0");
  });
});

function applyInput() {
  return {
    appRoot,
    workspace,
    release: {
      tag: "v0.6.0",
      version: "0.6.0",
      commit: newCommit,
    },
    expectedCommit: newCommit,
    metadata: readShrimpyInstallMetadata(appRoot)!,
  };
}

function createStage(version: string): string {
  const path = join(root, `stage-${version}`);
  mkdirSync(join(path, "dist"), { recursive: true });
  writeFileSync(join(path, "version.txt"), version, "utf-8");
  writeFileSync(join(path, "dist", "cli.js"), "#!/usr/bin/env node\n", "utf-8");
  return path;
}
