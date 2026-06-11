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
import {
  setupInit,
} from "../dist/setup/init.js";
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
    const soulPath = join(agentRoot, "SOUL.md");
    const mechanicSoulPath = join(mechanicRoot, "SOUL.md");
    const contextIdentityPath = join(agentRoot, "context", "identity.md");
    const contextHabitsPath = join(agentRoot, "context", "habits.md");
    const mechanicContextIdentityPath = join(mechanicRoot, "context", "identity.md");
    const mechanicContextHabitsPath = join(mechanicRoot, "context", "habits.md");
    const mechanicContextScopePath = join(mechanicRoot, "context", "scope.md");
    const sharedVaultPath = join(workspace, "vault");
    const sharedProjectsPath = join(workspace, "projects");
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
    const workspaceMigrationSkillPath = join(
      mechanicRoot,
      "skills",
      "workspace-migration",
      "SKILL.md",
    );
    const mechanicIdeasSkillPath = join(
      mechanicRoot,
      "skills",
      "shrimpy-mechanic-ideas",
      "SKILL.md",
    );
    const mechanicIdeasReferencePath = join(
      mechanicRoot,
      "skills",
      "shrimpy-mechanic-ideas",
      "references",
      "pattern-inventory.md",
    );
    const agentVaultPath = join(agentRoot, "vault");
    const mechanicVaultPath = join(mechanicRoot, "vault");
    const agentProjectsPath = join(agentRoot, "projects");
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
    assert.equal(existsSync(workspaceDocPath), true);
    assert.equal(existsSync(userPath), true);
    assert.equal(existsSync(systemPath), true);
    assert.equal(existsSync(soulPath), true);
    assert.equal(existsSync(mechanicSoulPath), true);
    assert.equal(existsSync(contextIdentityPath), false);
    assert.equal(existsSync(contextHabitsPath), true);
    assert.equal(existsSync(mechanicContextIdentityPath), false);
    assert.equal(existsSync(mechanicContextHabitsPath), true);
    assert.equal(existsSync(mechanicContextScopePath), true);
    assert.equal(existsSync(sharedVaultPath), true);
    assert.equal(existsSync(sharedProjectsPath), true);
    assert.equal(existsSync(memoryManagementSkillPath), false);
    assert.equal(existsSync(journalDailySkillPath), false);
    assert.equal(existsSync(journalCompactSkillPath), false);
    assert.equal(existsSync(setupSkillPath), false);
    assert.equal(existsSync(mechanicSkillPath), false);
    assert.equal(existsSync(addAgentSkillPath), false);
    assert.equal(existsSync(channelRoutingSkillPath), false);
    assert.equal(existsSync(watchesSkillPath), false);
    assert.equal(existsSync(workspaceMigrationSkillPath), false);
    assert.equal(existsSync(mechanicIdeasSkillPath), false);
    assert.equal(existsSync(mechanicIdeasReferencePath), false);
    assert.equal(existsSync(agentVaultPath), true);
    assert.equal(existsSync(mechanicVaultPath), true);
    assert.equal(existsSync(agentProjectsPath), false);
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
      "run_child",
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
      "run_child",
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
    assert.match(system, /Install-managed Shrimpy app checkout lives under/);
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
    assert.match(system, /persist the relevant Markdown note before claiming it will be remembered/);
    assert.equal(system.includes(projectRoot), true);
    assert.equal(system.includes(join(projectRoot, "src")), true);
    assert.equal(system.includes(join(projectRoot, "docs")), true);
    assert.equal(system.includes(workspace), false);

    const soul = readFileSync(soulPath, "utf-8");
    // very important
    assert.match(soul, /Enjoys adding the shrimpy emoji to responses\. 🦐/u);
    const mechanicSoul = readFileSync(mechanicSoulPath, "utf-8");
    assert.match(mechanicSoul, /You are Mechanic/);
    assert.match(mechanicSoul, /setup, repair, configuration/);
    assert.match(mechanicSoul, /Do not treat yourself as the user's normal `shrimpy` agent/);

    const workspaceDoc = readFileSync(workspaceDocPath, "utf-8");
    assert.match(workspaceDoc, /This workspace is the home system/);
    assert.match(workspaceDoc, /Shared saved files and collections live under `vault\/`/);
    assert.match(workspaceDoc, /Shared code, apps, experiments, and focused work folders live under `projects\/`/);
    assert.match(workspaceDoc, /Install-managed Shrimpy app checkout lives under/);
    assert.match(workspaceDoc, /Do not put reports in `context\/`/);
    assert.equal(workspaceDoc.includes(projectRoot), true);
    assert.equal(workspaceDoc.includes(join(projectRoot, "src")), true);
    assert.equal(workspaceDoc.includes(join(projectRoot, "docs")), true);

    const habits = readFileSync(contextHabitsPath, "utf-8");
    assert.match(habits, /How I tend to work/);
    const mechanicHabits = readFileSync(mechanicContextHabitsPath, "utf-8");
    assert.match(mechanicHabits, /How I tend to work/);
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
