import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildInventory,
} from "../src/skills/included/shrimpy-update/scripts/inventory.mjs";
import {
  evaluateGatewayHealth,
  verifyUpdate,
} from "../src/skills/included/shrimpy-update/scripts/verify.mjs";

let root: string;
let appRoot: string;
let workspace: string;
let fakeShrimpy: string;
let currentCommit: string;
let targetCommit: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shrimpy-update-skill-test-"));
  appRoot = join(root, "app");
  workspace = join(root, "workspace");
  fakeShrimpy = join(root, "shrimpy");
  mkdirSync(appRoot, { recursive: true });
  mkdirSync(join(workspace, "runtime", "logs"), { recursive: true });
  writeFileSync(join(workspace, "runtime", "logs", "gateway.log"), "gateway ready\n", "utf8");
  initGitFixture();
  writeFakeShrimpy();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("shrimpy-update inventory script", () => {
  test("summarizes source, skill, port, and command impact without changing refs", async () => {
    const before = git("rev-parse", "HEAD");
    const inventory = await buildInventory({
      appRoot,
      workspace,
      shrimpy: fakeShrimpy,
      currentRef: "v0.6.1",
      targetRef: "v0.7.0",
      targetCommit,
    });

    assert.equal(inventory.install.type, "source-checkout");
    assert.equal(inventory.install.currentCommit, currentCommit);
    assert.equal(inventory.releases.fastForward.eligible, true);
    assert.equal(inventory.diff.available, true);
    assert.ok(inventory.diff.files.some((file: any) =>
      file.path === "src/skills/included/shrimpy-update/SKILL.md"
    ));
    assert.deepEqual(inventory.includedSkills, [{
      id: "shrimpy-update",
      installedCopies: [{
        agentId: "mechanic",
        scope: "agent",
        installedPath: join(workspace, "agents", "mechanic", "skills", "shrimpy-update"),
        modified: true,
        source: "included:shrimpy-update",
      }],
    }]);
    assert.equal(inventory.portCandidates.length, 1);
    assert.equal(inventory.portCandidates[0].port, 6123);
    assert.equal(inventory.portCandidates[0].source, "src/gateway/new-service.ts");
    assert.equal(typeof inventory.portCandidates[0].availableOnLoopback, "boolean");
    assert.ok(inventory.proposedCommands.some((command: string) =>
      command.includes("env -u SHRIMPY_WORKSPACE npm --prefix") && command.endsWith(" test")
    ));
    assert.equal(git("rev-parse", "HEAD"), before);
  });
});

describe("shrimpy-update verifier script", () => {
  test("accepts a healthy heartbeat with healthy surfaces", async () => {
    const result = await evaluateGatewayHealth({
      version: 1,
      pid: process.pid,
      workspace,
      appCheckout: appRoot,
      heartbeatAt: Date.now(),
      surfaces: {
        telegram: {
          status: "healthy",
          consecutiveFailures: 0,
          stallRestartCount: 0,
        },
      },
      web: { enabled: false },
    }, {
      workspace,
      appRoot,
      heartbeatMaxAgeMs: 15_000,
    });

    assert.equal(result.ok, true);
  });

  test("validates every agent and a deliberately stopped gateway", async () => {
    const result = await verifyUpdate({
      expectedTag: "v0.6.1",
      expectedCommit: currentCommit,
      gateway: "stopped",
      appRoot,
      workspace,
      shrimpy: fakeShrimpy,
    });

    assert.equal(result.ok, true);
    assert.equal(result.checks.skills.agents.length, 1);
    assert.equal(result.checks.skills.agents[0].agentId, "mechanic");
    assert.equal(result.checks.context.agents[0].ok, true);
    assert.equal(result.checks.gateway.expected, "stopped");
  });
});

function initGitFixture(): void {
  execFileSync("git", ["init", "-q"], { cwd: appRoot });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: appRoot });
  execFileSync("git", ["config", "user.name", "Shrimpy Test"], { cwd: appRoot });
  writeFileSync(join(appRoot, "package.json"), JSON.stringify({
    name: "shrimpy",
    version: "0.6.1",
    engines: { node: ">=22.19.0" },
  }, null, 2));
  mkdirSync(join(appRoot, "src"), { recursive: true });
  writeFileSync(join(appRoot, "src", "base.ts"), "export const base = true;\n");
  execFileSync("git", ["add", "."], { cwd: appRoot });
  execFileSync("git", ["commit", "-qm", "current"], { cwd: appRoot });
  currentCommit = git("rev-parse", "HEAD");
  execFileSync("git", ["tag", "v0.6.1"], { cwd: appRoot });

  const skillDir = join(appRoot, "src", "skills", "included", "shrimpy-update");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "# Update\n");
  const gatewayDir = join(appRoot, "src", "gateway");
  mkdirSync(gatewayDir, { recursive: true });
  writeFileSync(join(gatewayDir, "new-service.ts"), "export const port = 6123;\n");
  writeFileSync(join(appRoot, "package.json"), JSON.stringify({
    name: "shrimpy",
    version: "0.7.0",
    engines: { node: ">=22.19.0" },
  }, null, 2));
  execFileSync("git", ["add", "."], { cwd: appRoot });
  execFileSync("git", ["commit", "-qm", "target"], { cwd: appRoot });
  targetCommit = git("rev-parse", "HEAD");
  execFileSync("git", ["tag", "v0.7.0"], { cwd: appRoot });
  execFileSync("git", ["checkout", "-q", currentCommit], { cwd: appRoot });
}

function writeFakeShrimpy(): void {
  writeFileSync(fakeShrimpy, `#!/usr/bin/env node
const args = process.argv.slice(2);
const workspace = ${JSON.stringify(workspace)};
const appRoot = ${JSON.stringify(appRoot)};
if (args[0] === "update") {
  console.log(JSON.stringify({
    workspace,
    install: { appRoot, managed: false, currentVersion: "0.6.1", currentCommit: ${JSON.stringify(currentCommit)}, currentRef: "v0.6.1", dirty: false },
    updateAvailable: false,
    problems: ["source checkout"],
  }));
  process.exitCode = 1;
} else if (args[0] === "gateway" && args[1] === "status") {
  console.log("workspace: " + workspace);
  console.log("app checkout: " + appRoot);
  console.log("gateway manager: manual");
  console.log("gateway service: inactive");
  console.log("gateway process: stopped");
  console.log("gateway heartbeat: missing");
  console.log("web inspector: disabled");
} else if (args[0] === "gateway" && args[1] === "logs") {
  console.log(workspace + "/runtime/logs/gateway.log");
} else if (args[0] === "workspace") {
  console.log(JSON.stringify({ enabled: true, clean: true, diagnostics: [], changedPaths: [] }));
} else if (args[0] === "agent") {
  console.log(JSON.stringify([{ id: "mechanic" }]));
} else if (args[0] === "skills" && args[1] === "list") {
  console.log(JSON.stringify({ skills: [{
    id: "shrimpy-update",
    scope: "agent",
    packageInfo: {
      id: "shrimpy-update",
      installKey: "agent:mechanic:shrimpy-update",
      scope: "agent",
      agentId: "mechanic",
      installedPath: workspace + "/agents/mechanic/skills/shrimpy-update",
      modified: true,
      source: "included:shrimpy-update",
      sourceKind: "included",
    },
  }] }));
} else if (args[0] === "skills" && args[1] === "validate") {
  console.log(JSON.stringify({ issues: [] }));
} else if (args[0] === "context") {
  console.log(JSON.stringify({ target: { agentId: "mechanic" }, promptSections: [{ id: "base:SOUL.md" }] }));
} else if (args[0] === "--version") {
  console.log("shrimpy v0.6.1 - Test Tide");
} else {
  console.error("unexpected fake shrimpy command: " + args.join(" "));
  process.exitCode = 2;
}
`, "utf8");
  chmodSync(fakeShrimpy, 0o755);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: appRoot, encoding: "utf8" }).trim();
}
