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
import { projectRoot } from "../dist/app/project-root.js";

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
    const systemPath = join(workspace, "context", "SYSTEM.md");
    const userContextPath = join(workspace, "context", "USER.md");
    const workspaceContextPath = join(workspace, "context", "WORKSPACE.md");
    const agentRoot = join(workspace, "agents", "shrimpy");
    const mechanicRoot = join(workspace, "agents", "mechanic");
    const soulPath = join(agentRoot, "SOUL.md");
    const mechanicSoulPath = join(mechanicRoot, "SOUL.md");
    const contextIdentityPath = join(agentRoot, "context", "identity.md");
    const mechanicContextIdentityPath = join(mechanicRoot, "context", "identity.md");
    const mechanicContextScopePath = join(mechanicRoot, "context", "scope.md");
    const codingDelegationSkillPath = join(
      workspace,
      "skills",
      "shrimpy-coding-delegation",
      "SKILL.md",
    );
    const codexWebSearchSkillPath = join(
      workspace,
      "skills",
      "codex-web-search",
      "SKILL.md",
    );
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
    const rememberSkillPath = join(
      workspace,
      "skills",
      "remember",
      "SKILL.md",
    );
    const searchSkillPath = join(
      workspace,
      "skills",
      "shrimpy-search",
      "SKILL.md",
    );
    const setupSkillPath = join(
      mechanicRoot,
      "skills",
      "shrimpy-setup",
      "SKILL.md",
    );
    const agentsSkillPath = join(
      workspace,
      "skills",
      "shrimpy-agents",
      "SKILL.md",
    );
    const channelsSkillPath = join(
      workspace,
      "skills",
      "shrimpy-channels",
      "SKILL.md",
    );
    const watchesSkillPath = join(
      mechanicRoot,
      "skills",
      "shrimpy-watches",
      "SKILL.md",
    );
    const defaultWatchesSkillPath = join(
      mechanicRoot,
      "skills",
      "shrimpy-watches-default-init",
      "SKILL.md",
    );
    const skillsSkillPath = join(
      workspace,
      "skills",
      "shrimpy-skills",
      "SKILL.md",
    );
    const securityAuditSkillPath = join(
      mechanicRoot,
      "skills",
      "shrimpy-security-audit",
      "SKILL.md",
    );
    const hygieneAuditSkillPath = join(
      mechanicRoot,
      "skills",
      "shrimpy-hygiene-audit",
      "SKILL.md",
    );
    const workspaceMigrationSkillPath = join(
      mechanicRoot,
      "skills",
      "shrimpy-workspace-migration",
      "SKILL.md",
    );
    const agentVaultPath = join(agentRoot, "vault");
    const mechanicVaultPath = join(mechanicRoot, "vault");
    const agentProjectsPath = join(agentRoot, "projects");
    const mechanicProjectsPath = join(mechanicRoot, "projects");
    const sourceSetupValidatorPath = join(
      projectRoot,
      "src",
      "skills",
      "included",
      "shrimpy-setup",
      "scripts",
      "validate-config.sh",
    );

    assert.equal(existsSync(configPath), true);
    assert.equal(existsSync(channelsConfigPath), true);
    assert.equal(existsSync(join(agentRoot, "watches.json")), false);
    assert.equal(existsSync(join(mechanicRoot, "watches.json")), false);
    assert.equal(existsSync(systemPath), true);
    assert.equal(existsSync(userContextPath), true);
    assert.equal(existsSync(workspaceContextPath), true);
    assert.equal(existsSync(join(workspace, "profile", "WORKSPACE.md")), false);
    assert.equal(existsSync(join(workspace, "profile", "USER.md")), false);
    assert.equal(existsSync(join(workspace, "profile", "SYSTEM.md")), false);
    assert.equal(existsSync(soulPath), true);
    assert.equal(existsSync(mechanicSoulPath), true);
    assert.equal(existsSync(contextIdentityPath), false);
    assert.equal(existsSync(join(agentRoot, "context")), false);
    assert.equal(existsSync(mechanicContextIdentityPath), false);
    assert.equal(existsSync(mechanicContextScopePath), true);
    assert.equal(existsSync(join(workspace, "vault")), false);
    assert.equal(existsSync(join(workspace, "projects")), false);
    assert.equal(existsSync(codingDelegationSkillPath), true);
    assert.equal(existsSync(codexWebSearchSkillPath), false);
    assert.equal(existsSync(memoryManagementSkillPath), true);
    assert.equal(existsSync(journalDailySkillPath), true);
    assert.equal(existsSync(journalCompactSkillPath), true);
    assert.equal(existsSync(rememberSkillPath), true);
    assert.equal(existsSync(searchSkillPath), true);
    assert.equal(existsSync(setupSkillPath), true);
    assert.equal(existsSync(agentsSkillPath), true);
    assert.equal(existsSync(channelsSkillPath), true);
    assert.equal(existsSync(watchesSkillPath), true);
    assert.equal(existsSync(defaultWatchesSkillPath), true);
    assert.equal(existsSync(skillsSkillPath), true);
    assert.equal(existsSync(securityAuditSkillPath), true);
    assert.equal(existsSync(hygieneAuditSkillPath), true);
    assert.equal(existsSync(workspaceMigrationSkillPath), true);
    assert.equal(existsSync(agentVaultPath), true);
    assert.equal(existsSync(mechanicVaultPath), true);
    assert.equal(existsSync(agentProjectsPath), true);
    assert.equal(existsSync(mechanicProjectsPath), true);
    assert.equal(existsSync(sourceSetupValidatorPath), true);

    const skillPackages = JSON.parse(
      readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"),
    ).packages;
    assert.equal(skillPackages["workspace:codex-web-search"], undefined);
    assert.equal(skillPackages["workspace:memory-management"].sourceKind, "included");
    assert.equal(skillPackages["workspace:memory-management"].installKey, "workspace:memory-management");
    assert.equal(skillPackages["workspace:memory-management"].scope, "workspace");
    assert.equal(skillPackages["workspace:memory-management"].installedPath, join(workspace, "skills", "memory-management"));
    assert.equal(skillPackages["workspace:memory-management"].modified, false);
    assert.equal(skillPackages["workspace:shrimpy-coding-delegation"].sourceKind, "included");
    assert.equal(skillPackages["workspace:shrimpy-coding-delegation"].installKey, "workspace:shrimpy-coding-delegation");
    assert.equal(skillPackages["workspace:shrimpy-coding-delegation"].scope, "workspace");
    assert.equal(skillPackages["workspace:shrimpy-coding-delegation"].installedPath, join(workspace, "skills", "shrimpy-coding-delegation"));
    assert.equal(skillPackages["workspace:shrimpy-agents"].sourceKind, "included");
    assert.equal(skillPackages["workspace:shrimpy-agents"].installKey, "workspace:shrimpy-agents");
    assert.equal(skillPackages["workspace:shrimpy-agents"].scope, "workspace");
    assert.equal(skillPackages["workspace:shrimpy-agents"].installedPath, join(workspace, "skills", "shrimpy-agents"));
    assert.equal(skillPackages["workspace:shrimpy-channels"].sourceKind, "included");
    assert.equal(skillPackages["workspace:shrimpy-channels"].installKey, "workspace:shrimpy-channels");
    assert.equal(skillPackages["workspace:shrimpy-channels"].scope, "workspace");
    assert.equal(skillPackages["workspace:shrimpy-channels"].installedPath, join(workspace, "skills", "shrimpy-channels"));
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches"].sourceKind, "included");
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches"].installKey, "agent:mechanic:shrimpy-watches");
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches"].scope, "agent");
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches"].agentId, "mechanic");
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches"].installedPath, join(mechanicRoot, "skills", "shrimpy-watches"));
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches-default-init"].sourceKind, "included");
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches-default-init"].installKey, "agent:mechanic:shrimpy-watches-default-init");
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches-default-init"].scope, "agent");
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches-default-init"].agentId, "mechanic");
    assert.equal(skillPackages["agent:mechanic:shrimpy-watches-default-init"].installedPath, join(mechanicRoot, "skills", "shrimpy-watches-default-init"));
    assert.equal(skillPackages["workspace:shrimpy-search"].sourceKind, "included");
    assert.equal(skillPackages["workspace:shrimpy-search"].installKey, "workspace:shrimpy-search");
    assert.equal(skillPackages["workspace:shrimpy-search"].scope, "workspace");
    assert.equal(skillPackages["workspace:shrimpy-search"].installedPath, join(workspace, "skills", "shrimpy-search"));
    assert.equal(skillPackages["workspace:shrimpy-skills"].sourceKind, "included");
    assert.equal(skillPackages["workspace:shrimpy-skills"].installKey, "workspace:shrimpy-skills");
    assert.equal(skillPackages["workspace:shrimpy-skills"].scope, "workspace");
    assert.equal(skillPackages["workspace:shrimpy-skills"].installedPath, join(workspace, "skills", "shrimpy-skills"));
    assert.equal(skillPackages["agent:mechanic:shrimpy-setup"].sourceKind, "included");
    assert.equal(skillPackages["agent:mechanic:shrimpy-setup"].installKey, "agent:mechanic:shrimpy-setup");
    assert.equal(skillPackages["agent:mechanic:shrimpy-setup"].scope, "agent");
    assert.equal(skillPackages["agent:mechanic:shrimpy-setup"].agentId, "mechanic");
    assert.equal(skillPackages["agent:mechanic:shrimpy-setup"].installedPath, join(mechanicRoot, "skills", "shrimpy-setup"));
    assert.equal(skillPackages["agent:mechanic:shrimpy-setup"].modified, false);

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
    assert.equal(config.agents[0].cwd, "agents/shrimpy");
    assert.equal(config.agents[1].id, "mechanic");
    assert.equal(config.agents[1].root, "agents/mechanic");
    assert.equal(config.agents[1].cwd, ".");
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
      "workspace:context/",
      "agent:SOUL.md",
      "agent:context/",
    ]);
    assert.deepEqual(config.context.turn, {
      maxChars: 2000,
      producers: [],
      channelUnread: {
        enabled: true,
        channels: ["*"],
        includeLatest: true,
      },
      sessionStatus: {
        enabled: true,
        staleAfterMinutes: 720,
      },
      knowledge: {
        maxItems: 3,
        minScore: 1.5,
      },
    });

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
    assert.match(system, /shared baseline context/);
    assert.match(system, /Shrimpy is the home-agent layer/);
    assert.match(system, /Pi is the underlying agent runtime/);
    assert.match(system, /reference\//);
    assert.doesNotMatch(system, /Local Paths/);

    const userContext = readFileSync(userContextPath, "utf-8");
    assert.match(userContext, /Durable workspace-owner identity/);
    assert.match(userContext, /hard preferences/);
    assert.match(userContext, /prompt-loaded by default/);
    assert.doesNotMatch(userContext, /Local Paths/);

    const workspaceContext = readFileSync(workspaceContextPath, "utf-8");
    assert.match(workspaceContext, /local workspace details/);
    assert.match(workspaceContext, /Local Paths/);
    assert.match(workspaceContext, /Workspace:/);
    assert.match(workspaceContext, /Shrimpy checkout:/);
    assert.match(workspaceContext, /Source:/);
    assert.match(workspaceContext, /Docs:/);
    assert.match(workspaceContext, /Reference docs:/);
    assert.match(workspaceContext, /Included skills:/);
    assert.match(workspaceContext, /Workspace skills:/);
    assert.match(workspaceContext, /Agent skills:/);
    assert.match(workspaceContext, /Storage/);
    assert.match(workspaceContext, /Shared workspace context: `context\/`/);
    assert.match(workspaceContext, /Workspace owner context: `context\/USER\.md`/);
    assert.match(workspaceContext, /Agent context and prompt-loaded memory: `agents\/<id>\/context\/`/);
    assert.match(workspaceContext, /Saved artifacts and reports: `agents\/<id>\/vault\/`/);
    assert.match(workspaceContext, /Code, apps, experiments, and focused work folders: `agents\/<id>\/projects\/`/);
    assert.match(workspaceContext, /CLI/);
    assert.match(workspaceContext, /shrimpy context --sections/);
    assert.match(workspaceContext, /shrimpy channels read <name>/);
    assert.match(workspaceContext, /Use the `remember` skill when the user asks to save, capture, collect, archive, or remember something for later/);
    assert.doesNotMatch(workspaceContext, /skills\/remember|included:remember|# Remember/);
    assert.doesNotMatch(workspaceContext, /source URL or origin, capture timestamp, the user's request/);
    assert.doesNotMatch(workspaceContext, /agents\/shrimpy\/vault\/research\/<YYYY-MM-DD>-<slug>/);
    assert.match(workspaceContext, /Persist the relevant Markdown note before claiming it will be remembered/);
    assert.equal(workspaceContext.includes(workspace), true);
    assert.equal(workspaceContext.includes(projectRoot), true);
    assert.equal(workspaceContext.includes(join(projectRoot, "src")), true);
    assert.equal(workspaceContext.includes(join(projectRoot, "docs")), true);
    assert.equal(workspaceContext.includes(join(projectRoot, "docs", "reference")), true);
    assert.equal(workspaceContext.includes(join(projectRoot, "src", "skills", "included")), true);
    assert.equal(workspaceContext.includes(join(workspace, "skills")), true);
    assert.equal(workspaceContext.includes(join(workspace, "agents", "<id>", "skills")), true);

    const soul = readFileSync(soulPath, "utf-8");
    // very important
    assert.match(soul, /Enjoys adding the shrimpy emoji to responses\. 🦐/u);
    assert.doesNotMatch(soul, /skills\/remember|included:remember|# Remember/);
    const mechanicSoul = readFileSync(mechanicSoulPath, "utf-8");
    assert.match(mechanicSoul, /You are Mechanic/);
    assert.match(mechanicSoul, /setup, repair, configuration/);
    assert.match(mechanicSoul, /Use assigned Shrimpy skills first/);
    assert.match(mechanicSoul, /Do not treat yourself as the user's normal `shrimpy` agent/);

    assert.equal(system.includes(join(projectRoot, "docs", "patterns")), false);

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

    const systemPath = join(workspace, "context", "SYSTEM.md");
    const userContextPath = join(workspace, "context", "USER.md");
    const workspaceContextPath = join(workspace, "context", "WORKSPACE.md");
    const soulPath = join(workspace, "agents", "shrimpy", "SOUL.md");
    writeFileSync(systemPath, "# SYSTEM\n\ncustom\n", "utf-8");
    writeFileSync(userContextPath, "# USER\n\ncustom\n", "utf-8");
    writeFileSync(workspaceContextPath, "# WORKSPACE\n\ncustom\n", "utf-8");
    writeFileSync(soulPath, "# SOUL\n\ncustom\n", "utf-8");

    await setupInit(workspace);
    assert.equal(readFileSync(systemPath, "utf-8"), "# SYSTEM\n\ncustom\n");
    assert.equal(readFileSync(userContextPath, "utf-8"), "# USER\n\ncustom\n");
    assert.equal(readFileSync(workspaceContextPath, "utf-8"), "# WORKSPACE\n\ncustom\n");
    assert.equal(readFileSync(soulPath, "utf-8"), "# SOUL\n\ncustom\n");
  });
});
