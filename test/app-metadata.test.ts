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

test("CLI help and version advertise the package version tagline", () => {
  const help = runCli("--help");
  assert.match(
    help,
    new RegExp(
      `^${escapeRegExp(expectedVersionLabel())} - ${escapeRegExp(packageJson.description)}`,
    ),
  );

  const version = runCli("--version");
  assert.equal(version.trim(), expectedVersionLabel());
});

test("boot env uses the package version", () => {
  assert.equal(resolveBootEnv(repoRoot).shrimpy_version, packageJson.version);
});

function runCli(arg: string): string {
  return execFileSync(process.execPath, [join(repoRoot, "dist", "cli.js"), arg], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });
}

function expectedVersionLabel(): string {
  const releaseName = packageJson.shrimpy?.releaseName;
  const base = `${packageJson.name} v${packageJson.version}`;
  return releaseName ? `${base} - ${releaseName}` : base;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
