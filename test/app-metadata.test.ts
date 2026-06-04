import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatVersionLabel,
  readAppMetadata,
} from "../dist/app/metadata.js";
import { resolveBootEnv } from "../dist/context/env.js";

interface PackageJson {
  name: string;
  version: string;
  description: string;
  shrimpy?: {
    releaseName?: string;
  };
}

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const packageJson = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf-8"),
) as PackageJson;

test("app metadata is sourced from package.json", () => {
  const metadata = readAppMetadata();

  assert.equal(metadata.name, packageJson.name);
  assert.equal(metadata.version, packageJson.version);
  assert.equal(metadata.description, packageJson.description);
  assert.equal(metadata.releaseName, packageJson.shrimpy?.releaseName);
  assert.equal(formatVersionLabel(metadata), expectedVersionLabel());
});

test("CLI help and version advertise the package version tagline quickly", () => {
  const help = timedRunCli("--help");
  assert.ok(
    help.elapsedMs < CLI_COLD_START_BUDGET_MS,
    `expected --help under ${CLI_COLD_START_BUDGET_MS}ms, got ${help.elapsedMs.toFixed(1)}ms`,
  );
  assert.match(
    help.output,
    new RegExp(
      `^${escapeRegExp(expectedVersionLabel())} - ${escapeRegExp(packageJson.description)}`,
    ),
  );

  const version = timedRunCli("--version");
  assert.ok(
    version.elapsedMs < CLI_COLD_START_BUDGET_MS,
    `expected --version under ${CLI_COLD_START_BUDGET_MS}ms, got ${version.elapsedMs.toFixed(1)}ms`,
  );
  assert.equal(version.output.trim(), expectedVersionLabel());
});

test("boot env uses the package version", () => {
  assert.equal(resolveBootEnv(repoRoot).shrimpy_version, packageJson.version);
});

const CLI_COLD_START_BUDGET_MS = 1_000;

function timedRunCli(arg: string): { output: string; elapsedMs: number } {
  const started = process.hrtime.bigint();
  const output = execFileSync(process.execPath, [join(repoRoot, "dist", "cli.js"), arg], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  return { output, elapsedMs };
}

function expectedVersionLabel(): string {
  const releaseName = packageJson.shrimpy?.releaseName;
  const base = `${packageJson.name} v${packageJson.version}`;
  return releaseName ? `${base} - ${releaseName}` : base;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
