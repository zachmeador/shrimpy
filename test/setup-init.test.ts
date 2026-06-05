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
    const sharedAddAgentSkillPath = join(workspace, "skills", "add-agent", "SKILL.md");
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
    const schedulesSkillPath = join(
      mechanicRoot,
      "skills",
      "schedules",
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
    const setupValidatorPath = setupSkillValidatorPath(workspace);

    assert.equal(existsSync(configPath), true);
    assert.equal(existsSync(channelsConfigPath), true);
    assert.equal(existsSync(watchesPath), true);
    assert.equal(existsSync(workspaceDocPath), true);
    assert.equal(existsSync(userPath), true);
    assert.equal(existsSync(systemPath), true);
    assert.equal(existsSync(soulPath), true);
    assert.equal(existsSync(mechanicSoulPath), true);
    assert.equal(existsSync(contextIdentityPath), true);
    assert.equal(existsSync(contextHabitsPath), true);
    assert.equal(existsSync(mechanicContextIdentityPath), true);
    assert.equal(existsSync(mechanicContextHabitsPath), true);
    assert.equal(existsSync(mechanicContextScopePath), true);
    assert.equal(existsSync(sharedVaultPath), true);
    assert.equal(existsSync(sharedProjectsPath), true);
    assert.equal(existsSync(sharedAddAgentSkillPath), false);
    assert.equal(existsSync(memoryManagementSkillPath), true);
    assert.equal(existsSync(journalDailySkillPath), true);
    assert.equal(existsSync(journalCompactSkillPath), true);
    assert.equal(existsSync(setupSkillPath), true);
    assert.equal(existsSync(mechanicSkillPath), true);
    assert.equal(existsSync(addAgentSkillPath), true);
    assert.equal(existsSync(channelRoutingSkillPath), true);
    assert.equal(existsSync(schedulesSkillPath), true);
    assert.equal(existsSync(mechanicIdeasSkillPath), true);
    assert.equal(existsSync(mechanicIdeasReferencePath), true);
    assert.equal(existsSync(agentVaultPath), true);
    assert.equal(existsSync(mechanicVaultPath), true);
    assert.equal(existsSync(agentProjectsPath), false);
    assert.equal(existsSync(setupValidatorPath), true);

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
    assert.match(system, /editable workspace-level Shrimpy framework context/);
    assert.match(system, /Compact immutable system instructions are prepended separately/);
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
    assert.match(workspaceDoc, /Do not put reports in `context\/`/);
    assert.equal(workspaceDoc.includes(join(projectRoot, "docs")), true);

    const identity = readFileSync(contextIdentityPath, "utf-8");
    assert.match(identity, /Notes I keep about myself/);
    const habits = readFileSync(contextHabitsPath, "utf-8");
    assert.match(habits, /How I tend to work/);
    const mechanicIdentity = readFileSync(mechanicContextIdentityPath, "utf-8");
    assert.match(mechanicIdentity, /Shrimpy mechanic/);
    assert.match(mechanicIdentity, /short durable notes/);
    assert.match(mechanicIdentity, /task playbooks in skills/);
    assert.doesNotMatch(mechanicIdentity, /not the default `shrimpy` agent/);
    const mechanicScope = readFileSync(mechanicContextScopePath, "utf-8");
    assert.match(mechanicScope, /workspace-specific maintenance boundaries/);
    assert.match(mechanicScope, /No extra workspace-specific scope/);
    assert.doesNotMatch(mechanicScope, /Start from evidence/);

    const addAgent = readFileSync(addAgentSkillPath, "utf-8");
    assert.match(addAgent, /name: add-agent/);
    assert.match(addAgent, /shrimpy agent add/);
    assert.match(addAgent, /channel-policy explain/);
    assert.match(addAgent, /Do not create adapter-shaped names/);
    assert.match(addAgent, /telegram~<instance-id>~<chat-id>/);
    assert.match(addAgent, /telegram~fitness/);
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
    assert.match(setupSkill, /This setup session runs as the `mechanic` agent/);
    assert.match(setupSkill, /Start by inspecting the current workspace state/);
    assert.match(setupSkill, /ask exactly one next setup\s+decision/i);
    assert.match(setupSkill, /official Shrimpy workspace paths/);
    assert.match(setupSkill, /crawl other\s+accessible folders on this machine/);
    assert.match(setupSkill, /scheduled background tasks enabled/);
    assert.match(setupSkill, /enabled: false/);
    assert.match(setupSkill, /modelPolicy: "coding"/);
    assert.match(setupSkill, /This setup session runs as the `mechanic` agent/);
    assert.match(setupSkill, /first normal agent/);
    assert.match(setupSkill, /shrimpy setup telegram/);
    assert.match(setupSkill, /Do not create adapter-shaped channel names by hand/);
    assert.match(setupSkill, /agents\/mechanic\/skills\/setup\/scripts\/validate-config\.sh/);
    assert.match(setupSkill, /agents\/<id>\//);
    assert.doesNotMatch(setupSkill, /as the\s+default `shrimpy` agent/i);
    assert.match(setupSkill, /validate-config\.sh/);

    const mechanicSkill = readFileSync(mechanicSkillPath, "utf-8");
    assert.match(mechanicSkill, /name: mechanic/);
    assert.match(mechanicSkill, /caretaker of the Shrimpy environment/);
    assert.match(mechanicSkill, /Maintain `shrimpy` and any future agents/);
    assert.match(mechanicSkill, /Start from evidence/);
    assert.match(mechanicSkill, /Keep agent ownership explicit/);
    assert.match(mechanicSkill, /triage skill/);
    assert.match(mechanicSkill, /Use the `add-agent` skill/);
    assert.match(mechanicSkill, /Use the `channel-routing` skill/);
    assert.match(mechanicSkill, /Use the `schedules` skill/);
    assert.match(mechanicSkill, /Use the `shrimpy-mechanic-ideas` skill/);
    assert.doesNotMatch(mechanicSkill, /telegram~fitness/);
    assert.doesNotMatch(mechanicSkill, /You are not the default `shrimpy` agent/);
    const channelRoutingSkill = readFileSync(channelRoutingSkillPath, "utf-8");
    assert.match(channelRoutingSkill, /name: channel-routing/);
    assert.match(channelRoutingSkill, /channels, channel policies, chat surfaces, Telegram/);
    assert.match(channelRoutingSkill, /telegram~<instance-id>~<chat-id>/);
    assert.match(channelRoutingSkill, /telegram~fitness/);
    assert.match(channelRoutingSkill, /shrimpy surface set-agent/);
    const schedulesSkill = readFileSync(schedulesSkillPath, "utf-8");
    assert.match(schedulesSkill, /name: schedules/);
    assert.match(schedulesSkill, /creating, changing, inspecting, or debugging Shrimpy schedules and watches/);
    assert.match(schedulesSkill, /reference\/configuration\.md/);
    assert.match(schedulesSkill, /reference\/runtime\.md/);
    assert.match(schedulesSkill, /shrimpy watches add/);
    assert.match(schedulesSkill, /shrimpy watches show <agent-id>\/<watch-id> --json/);
    assert.match(schedulesSkill, /Do not assume a posted watch message wakes the owner agent/);
    assert.match(schedulesSkill, /Do not use adapter-shaped channel names/);
    const mechanicIdeasSkill = readFileSync(mechanicIdeasSkillPath, "utf-8");
    assert.match(mechanicIdeasSkill, /name: shrimpy-mechanic-ideas/);
    assert.match(mechanicIdeasSkill, /recommending new skills, agents, watches, reports, apps/);
    assert.match(mechanicIdeasSkill, /Do not create skills, agents, watches, or routes unless the user asks/);
    const mechanicIdeasReference = readFileSync(mechanicIdeasReferencePath, "utf-8");
    assert.match(mechanicIdeasReference, /Mechanic Owner Menu/);

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
