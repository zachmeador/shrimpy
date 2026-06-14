import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const installScript = join(projectRoot, "scripts", "install.sh");

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shrimpy-install-script-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function createFakeShrimpyRepo(): string {
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "index.ts"), "export const ok = true;\n", "utf-8");
  writeFileSync(
    join(repo, "build.mjs"),
    [
      'import { mkdirSync, writeFileSync } from "node:fs";',
      'mkdirSync("dist/web", { recursive: true });',
      'writeFileSync("dist/cli.js", "#!/usr/bin/env node\\nconsole.log(\\"cli\\");\\n");',
      'writeFileSync("dist/gateway.js", "#!/usr/bin/env node\\nconsole.log(\\"gateway\\");\\n");',
      'writeFileSync("dist/web/server.js", "#!/usr/bin/env node\\nconsole.log(\\"web\\");\\n");',
      "",
    ].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(repo, "package.json"),
    JSON.stringify({
      name: "fake-shrimpy",
      version: "1.0.0",
      type: "module",
      scripts: {
        build: "node build.mjs",
      },
    }, null, 2) + "\n",
    "utf-8",
  );
  writeFileSync(
    join(repo, "package-lock.json"),
    JSON.stringify({
      name: "fake-shrimpy",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "fake-shrimpy",
          version: "1.0.0",
        },
      },
    }, null, 2) + "\n",
    "utf-8",
  );

  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["checkout", "-b", "main"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Shrimpy Test"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: repo, stdio: "ignore" });
  return repo;
}

function runInstall(repo: string, installDir: string, binDir: string): string {
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  return execFileSync("bash", [installScript], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      SHRIMPY_REPO: `file://${repo}`,
      SHRIMPY_REF: "main",
      SHRIMPY_INSTALL_DIR: installDir,
      SHRIMPY_BIN_DIR: binDir,
      SHRIMPY_NO_AUTO_COMPLETION: "1",
      HOME: home,
      SHELL: "/bin/zsh",
    },
  });
}

describe("install.sh", () => {
  test("installs a git-backed app checkout and protects local changes", () => {
    const repo = createFakeShrimpyRepo();
    const installDir = join(root, "install", "app");
    const binDir = join(root, "bin");

    const output = runInstall(repo, installDir, binDir);

    assert.match(output, /Cloning Shrimpy from file:\/\//);
    assert.match(output, /Building Shrimpy/);
    assert.equal(existsSync(join(installDir, ".git")), true);
    assert.equal(existsSync(join(installDir, "src", "index.ts")), true);
    assert.equal(
      execFileSync("git", ["-C", installDir, "rev-parse", "--abbrev-ref", "HEAD"], {
        encoding: "utf-8",
      }).trim(),
      "main",
    );
    assert.equal(
      execFileSync("git", [
        "-C",
        installDir,
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{u}",
      ], { encoding: "utf-8" }).trim(),
      "origin/main",
    );
    assert.equal(readlinkSync(join(binDir, "shrimpy")), join(installDir, "dist", "cli.js"));
    assert.equal(readlinkSync(join(binDir, "shrimpy-gateway")), join(installDir, "dist", "gateway.js"));
    assert.equal(readlinkSync(join(binDir, "shrimpy-web")), join(installDir, "dist", "web", "server.js"));
    assert.match(output, new RegExp(`${escapeRegExp(binDir)}/shrimpy setup`));
    assert.match(readFileSync(join(root, "home", ".zshrc"), "utf-8"), new RegExp(escapeRegExp(`export PATH="${binDir}:$PATH"`)));

    writeFileSync(join(installDir, "LOCAL.txt"), "local change\n", "utf-8");
    assert.throws(
      () => runInstall(repo, installDir, binDir),
      /install directory has local git changes/,
    );
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
