import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { parsePackageMetadata } from "../app/metadata.js";
import {
  readShrimpyInstallMetadata,
  writeShrimpyInstallMetadata,
  type ShrimpyInstallMetadata,
} from "../app/install-metadata.js";
import { withFileTransactionLock } from "../util/file-lock.js";
import { parseReleaseTag, type TaggedRelease } from "./releases.js";

export interface TaggedReleaseApplyResult {
  tag: string;
  commit: string;
  previousRef: string;
  previousCommit: string;
  appRoot: string;
  rolledBack: boolean;
  mechanicCheck: "passed";
}

interface ApplyTaggedReleaseInput {
  appRoot: string;
  workspace: string;
  release: TaggedRelease;
  expectedCommit: string;
  metadata: ShrimpyInstallMetadata;
}

interface ApplyTaggedReleaseDeps {
  execFileSync?: typeof execFileSync;
  stageRelease?: (
    input: ApplyTaggedReleaseInput,
  ) => string;
  checkMechanic?: (cliPath: string, workspace: string) => void;
  withLock?: <T>(targetPath: string, operation: () => T) => T;
  renameSync?: typeof renameSync;
  rmSync?: typeof rmSync;
  existsSync?: typeof existsSync;
}

export function applyTaggedRelease(
  input: ApplyTaggedReleaseInput,
  deps: ApplyTaggedReleaseDeps = {},
): TaggedReleaseApplyResult {
  if (input.release.commit !== input.expectedCommit) {
    throw new Error(
      `release tag ${input.release.tag} changed: expected ${input.expectedCommit}, found ${input.release.commit}`,
    );
  }
  if (input.metadata.installedCommit === input.release.commit) {
    throw new Error(`Shrimpy ${input.release.tag} is already installed`);
  }

  const parent = dirname(input.appRoot);
  const stageRelease = deps.stageRelease ?? ((stageInput) =>
    stageTaggedRelease(stageInput, deps.execFileSync ?? execFileSync));
  const stagePath = stageRelease(input);
  const lockPath = join(parent, ".shrimpy-update-transaction");
  const withLock = deps.withLock ?? withFileTransactionLock;

  try {
    return withLock(lockPath, () =>
      swapTaggedRelease(input, stagePath, deps)
    );
  } finally {
    if ((deps.existsSync ?? existsSync)(stagePath)) {
      (deps.rmSync ?? rmSync)(stagePath, { recursive: true, force: true });
    }
  }
}

export function stageTaggedRelease(
  input: ApplyTaggedReleaseInput,
  exec: typeof execFileSync = execFileSync,
): string {
  const parent = dirname(input.appRoot);
  const stagePath = mkdtempSync(join(parent, ".shrimpy-update-stage-"));
  try {
    run(exec, "git", ["clone", "--no-checkout", input.metadata.origin, stagePath]);
    run(exec, "git", ["-C", stagePath, "checkout", "--detach", input.release.tag]);
    const commit = run(exec, "git", ["-C", stagePath, "rev-parse", "HEAD"]);
    if (commit !== input.expectedCommit) {
      throw new Error(
        `staged ${input.release.tag} at ${commit}, expected ${input.expectedCommit}`,
      );
    }
    const metadata = parsePackageMetadata(
      readFileSync(join(stagePath, "package.json"), "utf-8"),
    );
    const tagVersion = parseReleaseTag(input.release.tag);
    if (!tagVersion || metadata.version !== tagVersion) {
      throw new Error(
        `release ${input.release.tag} contains package version ${metadata.version}`,
      );
    }
    run(exec, "npm", ["ci"], stagePath);
    run(exec, "npm", ["run", "build"], stagePath);
    run(exec, "npm", ["prune", "--omit=dev", "--package-lock=false"], stagePath);
    run(exec, process.execPath, [join(stagePath, "dist", "cli.js"), "--version"], stagePath);
    return stagePath;
  } catch (error) {
    rmSync(stagePath, { recursive: true, force: true });
    throw error;
  }
}

function swapTaggedRelease(
  input: ApplyTaggedReleaseInput,
  stagePath: string,
  deps: ApplyTaggedReleaseDeps,
): TaggedReleaseApplyResult {
  const rename = deps.renameSync ?? renameSync;
  const remove = deps.rmSync ?? rmSync;
  const pathExists = deps.existsSync ?? existsSync;
  const checkMechanic = deps.checkMechanic ?? checkMechanicCli;
  const parent = dirname(input.appRoot);
  const backupPath = join(
    parent,
    `.shrimpy-update-backup-${basename(input.appRoot)}-${randomUUID()}`,
  );
  const failedPath = join(
    parent,
    `.shrimpy-update-failed-${basename(input.appRoot)}-${randomUUID()}`,
  );
  let oldMoved = false;
  let newInstalled = false;
  let phase: "preflight" | "swap" | "mechanic-check" | "commit" = "preflight";

  try {
    const currentMetadata = readShrimpyInstallMetadata(input.appRoot);
    if (
      !currentMetadata ||
      currentMetadata.installedCommit !== input.metadata.installedCommit
    ) {
      throw new Error("managed Shrimpy install changed after update planning");
    }
    phase = "swap";
    rename(input.appRoot, backupPath);
    oldMoved = true;
    rename(stagePath, input.appRoot);
    newInstalled = true;

    phase = "mechanic-check";
    checkMechanic(join(input.appRoot, "dist", "cli.js"), input.workspace);
    phase = "commit";
    writeShrimpyInstallMetadata(input.appRoot, {
      origin: input.metadata.origin,
      requestedRef: input.release.tag,
      installedRef: input.release.tag,
      installedCommit: input.release.commit,
    });

    remove(backupPath, { recursive: true, force: true });
    return {
      tag: input.release.tag,
      commit: input.release.commit,
      previousRef: input.metadata.installedRef,
      previousCommit: input.metadata.installedCommit,
      appRoot: input.appRoot,
      rolledBack: false,
      mechanicCheck: "passed",
    };
  } catch (error) {
    if (!oldMoved && !newInstalled) throw error;
    if (newInstalled && pathExists(input.appRoot)) {
      rename(input.appRoot, failedPath);
      newInstalled = false;
    }
    if (oldMoved && pathExists(backupPath)) {
      rename(backupPath, input.appRoot);
      oldMoved = false;
    }
    if (pathExists(failedPath)) {
      remove(failedPath, { recursive: true, force: true });
    }
    if (pathExists(input.appRoot)) {
      try {
        checkMechanic(join(input.appRoot, "dist", "cli.js"), input.workspace);
      } catch (restoreError) {
        throw new Error(
          `new mechanic check failed and the restored mechanic check also failed: ${errorText(restoreError)}`,
          { cause: error },
        );
      }
    }
    const failure = phase === "mechanic-check"
      ? "new mechanic check failed"
      : `update ${phase} failed`;
    throw new Error(
      `${failure}; restored ${input.metadata.installedRef}: ${errorText(error)}`,
      { cause: error },
    );
  }
}

function checkMechanicCli(cliPath: string, workspace: string): void {
  run(execFileSync, process.execPath, [
    cliPath,
    "--workspace",
    workspace,
    "update",
    "check-mechanic",
    "--json",
  ]);
}

function run(
  exec: typeof execFileSync,
  file: string,
  args: string[],
  cwd?: string,
): string {
  return String(exec(file, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    ...(cwd ? { cwd } : {}),
  })).trim();
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
