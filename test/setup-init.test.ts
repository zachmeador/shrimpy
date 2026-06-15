import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { setupInit } from "./helpers.ts";
import { projectRoot } from "../dist/app/index.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-setup-init-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("setupInit", () => {
  test("creates baseline config files and workspace docs", async () => {
    await setupInit(workspace);

    const configPath = join(workspace, "config", "shrimpy.json");
    const channelsConfigPath = join(workspace, "config", "channels.json");
    const workspaceDocPath = join(workspace, "profile", "WORKSPACE.md");
    const userPath = join(workspace, "profile", "USER.md");
    const systemPath = join(workspace, "profile", "SYSTEM.md");
    const agentRoot = join(workspace, "agents", "shrimpy");
    const mechanicRoot = join(workspace, "agents", "mechanic");
    const watchesPath = join(agentRoot, "watches.json");
    const mechanicWatchesPath = join(mechanicRoot, "watches.json");
    const soulPath = join(agentRoot, "SOUL.md");
    const mechanicSoulPath = join(mechanicRoot, "SOUL.md");
    const contextIdentityPath = join(agentRoot, "context", "identity.md");
    const mechanicContextIdentityPath = join(mechanicRoot, "context", "identity.md");
    const mechanicContextScopePath = join(mechanicRoot, "context", "scope.md");
    const memoryManagementSkillPath = join(
      workspace,
      "skills",
      "memory-management",
      "SKILL.md",
    );
    const journalDailySkillPath = join(
      workspace,
      "skills",
      "journal-daily",
      "SKILL.md",
    );
    const journalCompactSkillPath = join(
      workspace,
      "skills",
      "journal-compact",
      "SKILL.md",
    );
    const vaultCaptureSkillPath = join(
      workspace,
      "skills",
      "vault-capture",
      "SKILL.md",
    );
    const setupSkillPath = join(
      mechanicRoot,
      "skills",
      "setup",
      "SKILL.md",
    );
    const mechanicSkillPath = join(
      mechanicRoot,
      "skills",
      "mechanic",
      "SKILL.md",
    );
    const addAgentSkillPath = join(
      mechanicRoot,
      "skills",
      "add-agent",
      "SKILL.md",
    );
    const channelRoutingSkillPath = join(
      mechanicRoot,
      "skills",
      "channel-routing",
      "SKILL.md",
    );
    const watchesSkillPath = join(
      mechanicRoot,
      "skills",
      "watches",
      "SKILL.md",
    );
    const securityAuditSkillPath = join(
      mechanicRoot,
      "skills",
      "security-audit",
      "SKILL.md",
    );
    const hygieneAuditSkillPath = join(
      mechanicRoot,
      "skills",
      "hygiene-audit",
      "SKILL.md",
    );
    const workspaceMigrationSkillPath = join(
      mechanicRoot,
      "skills",
      "workspace-migration",
      "SKILL.md",
    );
    const agentVaultPath = join(agentRoot, "vault");
    const mechanicVaultPath = join(mechanicRoot, "vault");
    const agentProjectsPath = join(agentRoot, "projects");
    const mechanicProjectsPath = join(mechanicRoot, "projects");
    const sourceSetupValidatorPath = join(
      projectRoot,
      "src",
      "setup",
      "templates",
      "mechanic",
      "skills",
      "setup",
      "scripts",
      "validate-config.sh",
    );

    assert.equal(existsSync(configPath), true);
    assert.equal(existsSync(channelsConfigPath), true);
    assert.equal(existsSync(watchesPath), true);
    assert.equal(existsSync(mechanicWatchesPath), true);
    assert.equal(existsSync(workspaceDocPath), true);
    assert.equal(existsSync(userPath), true);
    assert.equal(existsSync(systemPath), true);
    assert.equal(existsSync(soulPath), true);
    assert.equal(existsSync(mechanicSoulPath), true);
    assert.equal(existsSync(contextIdentityPath), false);
    assert.equal(existsSync(join(agentRoot, "context")), false);
    assert.equal(existsSync(mechanicContextIdentityPath), false);
    assert.equal(existsSync(mechanicContextScopePath), true);
    assert.equal(existsSync(join(workspace, "vault")), false);
    assert.equal(existsSync(join(workspace, "projects")), false);
    assert.equal(existsSync(memoryManagementSkillPath), false);
    assert.equal(existsSync(journalDailySkillPath), false);
    assert.equal(existsSync(journalCompactSkillPath), false);
    assert.equal(existsSync(vaultCaptureSkillPath), false);
    assert.equal(existsSync(setupSkillPath), false);
    assert.equal(existsSync(mechanicSkillPath), false);
    assert.equal(existsSync(addAgentSkillPath), false);
    assert.equal(existsSync(channelRoutingSkillPath), false);
    assert.equal(existsSync(watchesSkillPath), false);
    assert.equal(existsSync(securityAuditSkillPath), false);
    assert.equal(existsSync(hygieneAuditSkillPath), false);
    assert.equal(existsSync(workspaceMigrationSkillPath), false);
    assert.equal(existsSync(agentVaultPath), true);
    assert.equal(existsSync(mechanicVaultPath), true);
    assert.equal(existsSync(agentProjectsPath), true);
    assert.equal(existsSync(mechanicProjectsPath), true);
    assert.equal(existsSync(sourceSetupValidatorPath), true);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    assert.equal(config.watchClock.tickIntervalMs, 1000);
    assert.equal(config.watchClock.defaultTimezone, Intl.DateTimeFormat().resolvedOptions().timeZone);
    assert.deepEqual(config.status, {});
    assert.equal(config.agents[0].root, "agents/shrimpy");
    assert.equal(config.agents[0].modelPolicy, "coding");
    assert.deepEqual(config.agents[0].tools, [
      "reply",
      "ask",
      "notify",
      "report",
      "send_message",
      "read_channel",
    ]);
    assert.deepEqual(config.agents[0].channelPolicy, { mode: "all" });
    assert.equal(config.agents[1].id, "mechanic");
    assert.equal(config.agents[1].root, "agents/mechanic");
    assert.equal(config.agents[1].modelPolicy, "coding");
    assert.equal(config.agents[1].thinking, "high");
    assert.deepEqual(config.agents[1].tools, [
      "reply",
      "ask",
      "notify",
      "report",
      "send_message",
      "read_channel",
    ]);
    assert.deepEqual(config.agents[1].channelPolicy, { mode: "addressed" });
    assert.deepEqual(config.context.sources, [
      "workspace:profile/WORKSPACE.md",
      "workspace:profile/SYSTEM.md",
      "agent:SOUL.md",
      "workspace:profile/USER.md",
      "agent:context/",
    ]);
    assert.deepEqual(config.context.turn, {
      maxChars: 2000,
      channelUnread: {
        enabled: true,
        channels: ["*"],
        includeLatest: true,
      },
      sessionStatus: {
        enabled: true,
        staleAfterMinutes: 720,
      },
    });

    const watches = JSON.parse(readFileSync(watchesPath, "utf-8"));
    assert.equal(Array.isArray(watches), true);
    assert.deepEqual(watches.map((watch: any) => watch.id), [
      "memory-management",
      "journal-daily",
      "journal-compact",
    ]);
    assert.equal(watches[0].id, "memory-management");
    assert.deepEqual(watches[0].trigger, { kind: "time", cron: "0 3 * * *" });
    assert.equal(watches[0].action.kind, "message");
    assert.equal(watches[0].action.channel, "maintenance");
    assert.deepEqual(
      watches.map((watch: any) => watch.action.channel),
      ["maintenance", "maintenance", "maintenance"],
    );
    assert.match(watches[0].action.text, /memory-management/);
    assert.match(watches[1].action.text, /journal-daily/);
    assert.match(watches[2].action.text, /journal-compact/);
    assert.deepEqual(watches.map((watch: any) => watch.enabled), [
      false,
      false,
      false,
    ]);

    const mechanicWatches = JSON.parse(readFileSync(mechanicWatchesPath, "utf-8"));
    assert.deepEqual(mechanicWatches.map((watch: any) => watch.id), [
      "security-audit",
      "hygiene-audit",
    ]);
    assert.deepEqual(mechanicWatches.map((watch: any) => watch.enabled), [
      false,
      false,
    ]);

    const channelMemberships = JSON.parse(readFileSync(channelsConfigPath, "utf-8"));
    assert.deepEqual(channelMemberships.channels.home.agents, {
      shrimpy: {},
      mechanic: {},
    });
    assert.deepEqual(channelMemberships.channels.maintenance.agents, {
      shrimpy: {},
      mechanic: {},
    });

    const system = readFileSync(systemPath, "utf-8");
    assert.match(system, /all Shrimpy agents shared workspace context/);
    assert.match(system, /Edit it when the workspace's baseline guidance should change/);
    assert.match(system, /Use the Shrimpy source and docs paths listed in `profile\/WORKSPACE\.md`/);
    assert.match(system, /Framework Map/);
    assert.match(system, /reference\/context-assembly\.md/);
    assert.match(system, /Coding Work/);
    assert.match(system, /optional delegation is preferred/);
    assert.match(system, /real worker\/session handoff exists/);
    assert.match(system, /CLI Breadcrumbs/);
    assert.match(system, /When the `bash` tool is available/);
    assert.match(system, /shrimpy context --sections/);
    assert.match(system, /shrimpy channels read <name>/);
    assert.match(system, /Storage Breadcrumbs/);
    assert.match(system, /Use `agents\/<id>\/context\/` only for memory intended to load into prompts/);
    assert.doesNotMatch(system, /vault-capture/);
    assert.doesNotMatch(system, /source URL or origin, capture timestamp, the user's request/);
    assert.doesNotMatch(system, /agents\/shrimpy\/vault\/research\/<YYYY-MM-DD>-<slug>/);
    assert.match(system, /persist the relevant Markdown note before claiming it will be remembered/);
    assert.equal(system.includes(projectRoot), false);
    assert.equal(system.includes(join(projectRoot, "src")), false);
    assert.equal(system.includes(join(projectRoot, "docs")), false);
    assert.equal(system.includes(workspace), false);

    const soul = readFileSync(soulPath, "utf-8");
    // very important
    assert.match(soul, /Enjoys adding the shrimpy emoji to responses\. 🦐/u);
    assert.doesNotMatch(soul, /vault-capture/);
    const mechanicSoul = readFileSync(mechanicSoulPath, "utf-8");
    assert.match(mechanicSoul, /You are Mechanic/);
    assert.match(mechanicSoul, /setup, repair, configuration/);
    assert.match(mechanicSoul, /Do not treat yourself as the user's normal `shrimpy` agent/);

    const workspaceDoc = readFileSync(workspaceDocPath, "utf-8");
    assert.match(workspaceDoc, /This workspace is the home system/);
    assert.match(workspaceDoc, /Each agent keeps saved files and collections under `agents\/<id>\/vault\/`/);
    assert.match(workspaceDoc, /Each agent keeps code, apps, experiments, and focused work folders under `agents\/<id>\/projects\/`/);
    assert.doesNotMatch(workspaceDoc, /vault-capture/);
    assert.doesNotMatch(workspaceDoc, /durable user-owned collections such as recipes/);
    assert.doesNotMatch(workspaceDoc, /agents\/<id>\/vault\/recipes\/<slug>\.md/);
    assert.equal(workspaceDoc.includes("agents/shrimpy/vault/inbox/"), false);
    assert.match(workspaceDoc, /Local Paths/);
    assert.match(workspaceDoc, /Active workspace:/);
    assert.match(workspaceDoc, /Shrimpy app checkout:/);
    assert.match(workspaceDoc, /Shrimpy source:/);
    assert.match(workspaceDoc, /Shrimpy docs:/);
    assert.match(workspaceDoc, /Pattern docs:/);
    assert.match(workspaceDoc, /Reference docs:/);
    assert.match(workspaceDoc, /Source default skills:/);
    assert.match(workspaceDoc, /Source mechanic skills:/);
    assert.match(workspaceDoc, /Workspace skills:/);
    assert.match(workspaceDoc, /Agent skills:/);
    assert.match(workspaceDoc, /Do not put reports in `context\/`/);
    assert.equal(workspaceDoc.includes(workspace), true);
    assert.equal(workspaceDoc.includes(projectRoot), true);
    assert.equal(workspaceDoc.includes(join(projectRoot, "src")), true);
    assert.equal(workspaceDoc.includes(join(projectRoot, "docs")), true);
    assert.equal(workspaceDoc.includes(join(projectRoot, "docs", "patterns")), true);
    assert.equal(workspaceDoc.includes(join(projectRoot, "docs", "reference")), true);
    assert.equal(workspaceDoc.includes(join(projectRoot, "src", "setup", "templates", "skills")), true);
    assert.equal(workspaceDoc.includes(join(projectRoot, "src", "setup", "templates", "mechanic", "skills")), true);
    assert.equal(workspaceDoc.includes(join(workspace, "skills")), true);
    assert.equal(workspaceDoc.includes(join(workspace, "agents", "<id>", "skills")), true);

    const mechanicScope = readFileSync(mechanicContextScopePath, "utf-8");
    assert.match(mechanicScope, /workspace-specific maintenance boundaries/);
    assert.match(mechanicScope, /No extra workspace-specific scope/);
    assert.doesNotMatch(mechanicScope, /Start from evidence/);

    const validationOutput = execFileSync(
      "bash",
      [sourceSetupValidatorPath],
      { cwd: workspace, encoding: "utf-8" },
    );
    assert.match(validationOutput, /setup validation passed/);
  });

  test("does not overwrite existing config files", async () => {
    await setupInit(workspace);

    const configPath = join(workspace, "config", "shrimpy.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.custom = { keep: true };
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    await setupInit(workspace);
    const persisted = JSON.parse(readFileSync(configPath, "utf-8"));
    assert.deepEqual(persisted.custom, { keep: true });
  });

  test("does not overwrite existing workspace and agent docs", async () => {
    await setupInit(workspace);

    const systemPath = join(workspace, "profile", "SYSTEM.md");
    const soulPath = join(workspace, "agents", "shrimpy", "SOUL.md");
    writeFileSync(systemPath, "# SYSTEM\n\ncustom\n", "utf-8");
    writeFileSync(soulPath, "# SOUL\n\ncustom\n", "utf-8");

    await setupInit(workspace);
    assert.equal(readFileSync(systemPath, "utf-8"), "# SYSTEM\n\ncustom\n");
    assert.equal(readFileSync(soulPath, "utf-8"), "# SOUL\n\ncustom\n");
  });
});
