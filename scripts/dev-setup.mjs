#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cliPath = join(projectRoot, "dist", "cli.js");
const validCommands = new Set([
  "setup",
  "init",
  "status",
  "shell",
  "clean",
  "path",
  "run",
  "help",
]);

const args = process.argv.slice(2);
let command = "setup";
let commandSet = false;
let name = process.env.SHRIMPY_DEV_SETUP_NAME ?? "setup";
let fresh;
let build;
let piStateSource;
const cliArgs = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--") {
    cliArgs.push(...args.slice(i + 1));
    break;
  }
  if (arg === "--name") {
    const value = args[i + 1];
    if (!value) fail("--name requires a value");
    name = value;
    i += 1;
    continue;
  }
  if (arg.startsWith("--name=")) {
    name = arg.slice("--name=".length);
    continue;
  }
  if (arg === "--fresh") {
    fresh = true;
    continue;
  }
  if (arg === "--reuse") {
    fresh = false;
    continue;
  }
  if (arg === "--build") {
    build = true;
    continue;
  }
  if (arg === "--no-build") {
    build = false;
    continue;
  }
  if (arg === "--copy-pi-state") {
    piStateSource = true;
    continue;
  }
  if (arg.startsWith("--copy-pi-state=")) {
    piStateSource = arg.slice("--copy-pi-state=".length);
    continue;
  }
  if (arg === "--copy-pi-state-from") {
    const value = args[i + 1];
    if (!value) fail("--copy-pi-state-from requires a workspace path");
    piStateSource = value;
    i += 1;
    continue;
  }
  if (!commandSet && validCommands.has(arg)) {
    command = arg;
    commandSet = true;
    continue;
  }
  cliArgs.push(arg);
}

if (command === "help") {
  usage(0);
}

if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
  fail("--name may only contain letters, numbers, dot, underscore, and dash");
}

if (fresh === undefined) fresh = command === "setup" || command === "init";
if (build === undefined) build = command === "setup" || command === "init" || command === "run";

const root = join(tmpdir(), `shrimpy-dev-setup-${name}`);
const home = join(root, "home");
const workspace = join(root, "workspace");
const pointerPath = join(home, ".shrimpy-workspace.json");
const existedBefore = existsSync(root);

if (command === "clean") {
  rmSync(root, { force: true, recursive: true });
  console.log(`removed ${root}`);
  process.exit(0);
}

if (fresh) rmSync(root, { force: true, recursive: true });
mkdirSync(home, { recursive: true });
mkdirSync(workspace, { recursive: true });
writeFileSync(pointerPath, `${JSON.stringify({ workspace })}\n`, "utf-8");

if (piStateSource !== undefined) {
  const sourceWorkspace =
    piStateSource === true ? resolveWorkspaceFromHome(process.env.HOME) : piStateSource;
  copyPiState(sourceWorkspace, workspace);
}

const env = {
  ...process.env,
  HOME: home,
  SHRIMPY_DEV_HOME: home,
  SHRIMPY_DEV_WORKSPACE: workspace,
  SHRIMPY_NO_AUTO_COMPLETION: process.env.SHRIMPY_NO_AUTO_COMPLETION ?? "1",
};

printEnvSummary();

if (command === "path") {
  console.log(`export HOME=${quote(home)}`);
  console.log(`export SHRIMPY_DEV_HOME=${quote(home)}`);
  console.log(`export SHRIMPY_DEV_WORKSPACE=${quote(workspace)}`);
  process.exit(0);
}

if (build) {
  const result = await run("npm", ["run", "build"], { cwd: projectRoot, env: process.env });
  if (result.code !== 0) process.exit(result.code);
}

let result;
switch (command) {
  case "setup":
    result = await run("node", [cliPath, "setup", ...cliArgs], { cwd: projectRoot, env });
    break;
  case "init":
    result = await run("node", [cliPath, "setup", "init", ...cliArgs], {
      cwd: projectRoot,
      env,
    });
    break;
  case "status":
    result = await run("node", [cliPath, "status", ...cliArgs], { cwd: projectRoot, env });
    break;
  case "run":
    if (cliArgs.length === 0) fail("run requires a Shrimpy command, for example: run status");
    result = await run("node", [cliPath, ...cliArgs], { cwd: projectRoot, env });
    break;
  case "shell": {
    const shell = process.env.SHELL ?? "zsh";
    console.error(`[dev-setup] launching ${shell} in ${workspace}`);
    result = await run(shell, [], { cwd: workspace, env });
    break;
  }
  default:
    fail(`unknown command: ${command}`);
}

process.exit(result.code);

function run(cmd, runArgs, options) {
  return new Promise((resolve) => {
    const child = spawn(cmd, runArgs, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`[dev-setup] ${cmd} exited via ${signal}`);
      }
      resolve({ code: code ?? 1 });
    });
    child.on("error", (error) => {
      console.error(`[dev-setup] failed to start ${cmd}: ${error.message}`);
      resolve({ code: 1 });
    });
  });
}

function printEnvSummary() {
  const mode = fresh ? "fresh" : existedBefore ? "reuse" : "new";
  console.error(`[dev-setup] ${mode} env: ${root}`);
  console.error(`[dev-setup] home: ${home}`);
  console.error(`[dev-setup] workspace: ${workspace}`);
}

function quote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function fail(message) {
  console.error(`[dev-setup] ${message}`);
  usage(1);
}

function usage(code) {
  console.error(`Usage:
  npm run dev:setup [-- --name NAME] [-- --reuse] [-- --no-build]
  npm run dev:setup -- --copy-pi-state
  npm run dev:setup:tui
  npm run dev:setup:init
  npm run dev:setup:status
  npm run dev:setup:shell
  npm run dev:setup:clean

Commands:
  setup   Rebuild, reset the temp env, and run "shrimpy setup" (default).
  init    Rebuild, reset the temp env, and run "shrimpy setup init".
  status  Reuse the temp env and run "shrimpy status".
  shell   Reuse the temp env and open a shell with isolated HOME.
  run     Rebuild and run an arbitrary Shrimpy command in the temp env.
  path    Print exports for the temp env.
  clean   Remove the temp env.

Examples:
  npm run dev:setup:tui
  npm run dev:setup
  npm run dev:setup -- --name tui
  npm run dev:setup -- --copy-pi-state
  npm run dev:setup -- --copy-pi-state-from /path/to/workspace
  npm run dev:setup -- --reuse --no-build
  npm run dev:setup -- run models list
`);
  process.exit(code);
}

function resolveWorkspaceFromHome(homeDir) {
  const livePointerPath = join(homeDir, ".shrimpy-workspace.json");
  if (!existsSync(livePointerPath)) {
    fail(`cannot copy Pi state: ${livePointerPath} does not exist`);
  }
  const raw = JSON.parse(readFileSync(livePointerPath, "utf-8"));
  if (!raw || typeof raw.workspace !== "string" || raw.workspace.length === 0) {
    fail(`cannot copy Pi state: ${livePointerPath} has no workspace field`);
  }
  return raw.workspace;
}

function copyPiState(sourceWorkspace, targetWorkspace) {
  if (sourceWorkspace === targetWorkspace) {
    fail("refusing to copy Pi state from the target workspace into itself");
  }
  const sourceDir = join(sourceWorkspace, "state", "pi");
  const targetDir = join(targetWorkspace, "state", "pi");
  const copied = [];
  mkdirSync(targetDir, { recursive: true });

  for (const file of ["auth.json", "models.json"]) {
    const sourcePath = join(sourceDir, file);
    if (!existsSync(sourcePath)) continue;
    copyFileSync(sourcePath, join(targetDir, file));
    copied.push(file);
  }

  if (copied.length === 0) {
    fail(`cannot copy Pi state: no auth.json or models.json under ${sourceDir}`);
  }

  console.error(
    `[dev-setup] copied Pi ${copied.join(", ")} from ${sourceDir}; temp sandbox may contain credentials`,
  );
}
