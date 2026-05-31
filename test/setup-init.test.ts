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
  setupSkillValidatorPath,
} from "../dist/setup.js";
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
    const schedulesPath = join(agentRoot, "schedules.json");
    const soulPath = join(agentRoot, "SOUL.md");
    const contextIdentityPath = join(agentRoot, "context", "identity.md");
    const contextHabitsPath = join(agentRoot, "context", "habits.md");
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
      agentRoot,
      "skills",
      "setup",
      "SKILL.md",
    );
    const vaultPath = join(agentRoot, "vault");
    const setupValidatorPath = setupSkillValidatorPath(workspace);

    assert.equal(existsSync(configPath), true);
    assert.equal(existsSync(channelsConfigPath), true);
    assert.equal(existsSync(schedulesPath), true);
    assert.equal(existsSync(workspaceDocPath), true);
    assert.equal(existsSync(userPath), true);
    assert.equal(existsSync(systemPath), true);
    assert.equal(existsSync(soulPath), true);
    assert.equal(existsSync(contextIdentityPath), true);
    assert.equal(existsSync(contextHabitsPath), true);
    assert.equal(existsSync(memoryManagementSkillPath), true);
    assert.equal(existsSync(journalDailySkillPath), true);
    assert.equal(existsSync(journalCompactSkillPath), true);
    assert.equal(existsSync(setupSkillPath), true);
    assert.equal(existsSync(vaultPath), true);
    assert.equal(existsSync(setupValidatorPath), true);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    assert.equal(config.scheduler.tickIntervalMs, 1000);
    assert.deepEqual(config.status, {});
    assert.equal(config.agents[0].root, "agents/shrimpy");
    assert.deepEqual(config.agents[0].tools, [
      "reply",
      "ask",
      "notify",
      "report",
      "send_message",
      "read_channel",
      "run_child",
    ]);
    assert.deepEqual(config.agents[0].attention, { mode: "all" });
    assert.deepEqual(config.context.sources, [
      "workspace:profile/WORKSPACE.md",
      "workspace:profile/SYSTEM.md",
      "agent:SOUL.md",
      "workspace:profile/USER.md",
      "agent:context/",
    ]);

    const schedules = JSON.parse(readFileSync(schedulesPath, "utf-8"));
    assert.equal(Array.isArray(schedules), true);
    assert.deepEqual(schedules.map((schedule: any) => schedule.id), [
      "heartbeat",
      "memory-management",
      "journal-daily",
      "journal-compact",
    ]);
    assert.equal(schedules[0].id, "heartbeat");
    assert.equal(schedules[0].channel, "heartbeat");
    assert.equal(typeof schedules[0].instructions, "string");
    assert.deepEqual(
      schedules.map((schedule: any) => schedule.channel),
      ["heartbeat", "heartbeat", "heartbeat", "heartbeat"],
    );
    assert.match(schedules[1].instructions, /memory-management/);
    assert.match(schedules[2].instructions, /journal-daily/);
    assert.match(schedules[3].instructions, /journal-compact/);

    const channelMemberships = JSON.parse(readFileSync(channelsConfigPath, "utf-8"));
    assert.deepEqual(channelMemberships.channels.home.agents, {
      shrimpy: {},
    });
    assert.deepEqual(channelMemberships.channels.heartbeat.agents, {
      shrimpy: {},
    });

    const system = readFileSync(systemPath, "utf-8");
    assert.match(system, /Start with `README\.md` there before reading `musings\/`\./);
    assert.match(system, /Turn briefings\*\* are compact alerts and pointers/);
    assert.match(system, /default agent has `vault\/`/);
    assert.match(system, /Tools And Inspection/);
    assert.equal(system.includes(join(projectRoot, "docs")), true);
    assert.equal(system.includes(workspace), false);

    assert.match(system, /Be concise\./);
    assert.match(system, /Show file paths clearly/);
    assert.match(system, /Use whole-file writes only for new files or complete rewrites\./);

    const workspaceDoc = readFileSync(workspaceDocPath, "utf-8");
    assert.match(workspaceDoc, /This workspace is the home system/);
    assert.equal(workspaceDoc.includes(join(projectRoot, "docs")), true);

    const identity = readFileSync(contextIdentityPath, "utf-8");
    assert.match(identity, /Notes I keep about myself/);
    const habits = readFileSync(contextHabitsPath, "utf-8");
    assert.match(habits, /How I tend to work/);

    const memoryManagement = readFileSync(memoryManagementSkillPath, "utf-8");
    assert.match(memoryManagement, /name: memory-management/);
    assert.match(memoryManagement, /No special memory tool/);
    const journalDaily = readFileSync(journalDailySkillPath, "utf-8");
    assert.match(journalDaily, /name: journal-daily/);
    assert.match(journalDaily, /context\/journal\/days/);
    const journalCompact = readFileSync(journalCompactSkillPath, "utf-8");
    assert.match(journalCompact, /name: journal-compact/);
    assert.match(journalCompact, /context files list/);

    const setupSkill = readFileSync(setupSkillPath, "utf-8");
    assert.match(setupSkill, /Shrimpy setup skill inside Pi's interactive TUI/i);
    assert.match(setupSkill, /Start by inspecting the current workspace state/);
    assert.match(setupSkill, /validate-config\.sh/);

    const validationOutput = execFileSync(
      "bash",
      [setupValidatorPath],
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
