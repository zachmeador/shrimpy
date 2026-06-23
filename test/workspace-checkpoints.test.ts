import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRuntime } from "../dist/app/index.js";
import { cmdWorkspace } from "../dist/commands/workspace.js";
import { setupInit } from "./helpers.ts";
import {
  createWorkspaceCheckpointService,
  initializeWorkspaceCheckpointTracking,
  inspectWorkspaceCheckpointStatus,
} from "../dist/workspace-checkpoints/index.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-workspace-checkpoints-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

function git(args: string[], cwd = workspace): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

describe("workspace checkpoints", () => {
  test("does not treat a parent git repository as enabled workspace tracking", { skip: !hasGit }, () => {
    const parent = mkdtempSync(join(tmpdir(), "shrimpy-workspace-parent-git-test-"));
    try {
      git(["init"], parent);
      const child = join(parent, "workspace");
      mkdirSync(child);

      const status = inspectWorkspaceCheckpointStatus(child);

      assert.equal(status.enabled, false);
      assert.equal(status.clean, null);
      assert.deepEqual(status.changedPaths, []);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("refuses to adopt an existing repo without the Shrimpy whitelist", { skip: !hasGit }, () => {
    git(["init"]);

    assert.throws(
      () => initializeWorkspaceCheckpointTracking(workspace),
      /already has a git repo without the Shrimpy checkpoint whitelist/,
    );
  });

  test("initializes a workspace repo with the strict checkpoint whitelist", { skip: !hasGit }, async () => {
    await setupInit(workspace);
    mkdirSync(join(workspace, "state", "pi"), { recursive: true });
    mkdirSync(join(workspace, "runtime", "logs"), { recursive: true });
    mkdirSync(join(workspace, "channels"), { recursive: true });
    mkdirSync(join(workspace, "media"), { recursive: true });
    mkdirSync(join(workspace, "skills", "tiny"), { recursive: true });
    writeFileSync(join(workspace, "runtime", "logs", "gateway.log"), "runtime\n");
    writeFileSync(join(workspace, "channels", "home.jsonl"), "{}\n");
    writeFileSync(join(workspace, "media", "photo.txt"), "media\n");
    writeFileSync(join(workspace, "state", "pi", "auth.json"), "{}\n");
    writeFileSync(join(workspace, "skills", "tiny", "SKILL.md"), "---\nname: tiny\n---\n");

    const result = initializeWorkspaceCheckpointTracking(workspace);

    assert.equal(result.repositoryCreated, true);
    assert.equal(result.gitignoreWritten, true);
    assert.equal(result.checkpoint.created, true);
    assert.equal(result.status.enabled, true);
    assert.equal(result.status.clean, true);

    const files = git(["ls-files"]).split("\n").filter(Boolean);
    assert.equal(files.includes(".gitignore"), true);
    assert.equal(files.includes("context/SYSTEM.md"), true);
    assert.equal(files.includes("context/USER.md"), true);
    assert.equal(files.includes("context/WORKSPACE.md"), true);
    assert.equal(files.includes("config/shrimpy.json"), true);
    assert.equal(files.includes("agents/shrimpy/SOUL.md"), true);
    assert.equal(files.includes("agents/shrimpy/watches.json"), true);
    assert.equal(files.includes("skills/tiny/SKILL.md"), true);
    assert.equal(files.some((path) => path.startsWith("state/")), false);
    assert.equal(files.some((path) => path.startsWith("runtime/")), false);
    assert.equal(files.some((path) => path.startsWith("channels/")), false);
    assert.equal(files.some((path) => path.startsWith("media/")), false);
  });

  test("exposes init status and manual checkpoints through the workspace CLI", { skip: !hasGit }, async () => {
    await setupInit(workspace);

    const init = await captureLogs(() =>
      cmdWorkspace(["track", "init", "--json"], { workspace } as any)
    );
    assert.equal(init.result, 0);
    const initPayload = JSON.parse(init.lines.join("\n"));
    assert.equal(initPayload.repositoryCreated, true);
    assert.equal(initPayload.status.clean, true);

    writeFileSync(join(workspace, "context", "notes.md"), "# Notes\n\nLikes tiny checkpoints.\n");

    const dirty = await captureLogs(() =>
      cmdWorkspace(["track", "status", "--json"], { workspace } as any)
    );
    assert.equal(dirty.result, 0);
    const dirtyPayload = JSON.parse(dirty.lines.join("\n"));
    assert.equal(dirtyPayload.enabled, true);
    assert.equal(dirtyPayload.clean, false);
    assert.deepEqual(dirtyPayload.changedPaths, ["context/notes.md"]);

    const checkpoint = await captureLogs(() =>
      cmdWorkspace([
        "track",
        "checkpoint",
        "--message",
        "manual: update workspace context",
        "--json",
      ], { workspace } as any)
    );
    assert.equal(checkpoint.result, 0);
    const checkpointPayload = JSON.parse(checkpoint.lines.join("\n"));
    assert.equal(checkpointPayload.created, true);
    assert.equal(checkpointPayload.message, "manual: update workspace context");
    assert.deepEqual(checkpointPayload.changedPaths, ["context/notes.md"]);
    assert.equal(git(["log", "-1", "--pretty=%s"]), "manual: update workspace context");

    const cleanCheckpoint = await captureLogs(() =>
      cmdWorkspace([
        "track",
        "checkpoint",
        "--message",
        "manual: clean",
        "--json",
      ], { workspace } as any)
    );
    const cleanPayload = JSON.parse(cleanCheckpoint.lines.join("\n"));
    assert.equal(cleanPayload.created, false);
    assert.deepEqual(cleanPayload.changedPaths, []);
  });

  test("creates automatic checkpoints from the periodic service tick", { skip: !hasGit }, async () => {
    await setupInit(workspace);
    initializeWorkspaceCheckpointTracking(workspace);
    writeFileSync(join(workspace, "config", "channels.json"), JSON.stringify({ channels: {} }, null, 2));

    const runtime = createAppRuntime({ workspace });
    const service = createWorkspaceCheckpointService(runtime, {
      logger: {
        log() {},
        warn() {},
        error() {},
      },
    });

    const result = service.tick(new Date("2030-01-02T03:04:05.000Z"));

    assert.equal(result?.created, true);
    assert.equal(result?.message, "checkpoint: automatic 2030-01-02T03:04:05.000Z");
    assert.deepEqual(result?.changedPaths, ["config/channels.json"]);
    assert.equal(git(["log", "-1", "--pretty=%s"]), "checkpoint: automatic 2030-01-02T03:04:05.000Z");

    const clean = service.tick(new Date("2030-01-02T03:19:05.000Z"));
    assert.equal(clean, null);
  });
});
