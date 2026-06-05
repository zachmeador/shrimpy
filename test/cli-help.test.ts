import { execFileSync, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveCliHelpPath } from "../dist/commands/help.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, "..");
const cliPath = join(repoRoot, "dist", "cli.js");

test("group --help prints catalog-backed command usage", () => {
  const output = runCli("channels", "--help");

  assert.match(output, /usage:/);
  assert.match(output, /shrimpy channels \[--json\]/);
  assert.match(output, /shrimpy channels read <name> \[--limit N\] \[--json\]/);
  assert.match(output, /Read recent channel messages/);
});

test("root --help prints the calm default help surface", () => {
  const output = runCli("--help");

  assert.match(output, /shrimpy chat \[agent\]/);
  assert.match(output, /shrimpy help all/);
  assert.doesNotMatch(output, /shrimpy completion zsh/);
  assert.doesNotMatch(output, /shrimpy context sources run/);
});

test("help all prints the complete command catalog", () => {
  const output = runCli("help", "all");

  assert.match(output, /shrimpy completion zsh/);
  assert.match(output, /shrimpy context sources run/);
  assert.match(output, /shrimpy gateway logs/);
});

test("help can print one command path", () => {
  const output = runCli("help", "channels", "read");

  assert.match(output, /shrimpy channels read <name> \[--limit N\] \[--json\]/);
  assert.doesNotMatch(output, /shrimpy channels join/);
});

test("leaf --help prints only that command's usage", () => {
  const output = runCli("channels", "read", "--help");

  assert.match(output, /usage:/);
  assert.match(output, /shrimpy channels read <name> \[--limit N\] \[--json\]/);
  assert.match(output, /Read recent channel messages/);
  assert.doesNotMatch(output, /shrimpy channels join/);
});

test("leaf -h is accepted as help", () => {
  const output = runCli("channels", "read", "-h");

  assert.match(output, /shrimpy channels read <name> \[--limit N\] \[--json\]/);
});

test("nested namespace --help prints descendant command usage", () => {
  const output = runCli("models", "policies", "--help");

  assert.match(output, /shrimpy models policies \[list\] \[--json\]/);
  assert.match(output, /shrimpy models policies show <name> \[--json\]/);
  assert.match(output, /shrimpy models policies set <name> --candidate <provider>\/<model> \.\.\. \[--json\]/);
  assert.doesNotMatch(output, /shrimpy models resolve/);
});

test("help flags after -- stay positional", () => {
  assert.equal(resolveCliHelpPath(["channels", "post", "general", "--", "--help"]), null);
});

test("unknown command --help does not fall back to root help", () => {
  assert.equal(resolveCliHelpPath(["slkdfjs", "--help"]), null);

  const result = runCliResult("slkdfjs", "--help");

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unknown command or help topic: slkdfjs/);
  assert.match(result.stderr, /shrimpy help all/);
});

function runCli(...args: string[]): string {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });
}

function runCliResult(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      NO_COLOR: "1",
    },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
