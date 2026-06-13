import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cmdContext } from "../dist/commands/context.js";
import { cmdSkills } from "../dist/commands/skills.js";
import { setupInit } from "../dist/setup/init.js";
import {
  createAppRuntime,
  projectRoot,
} from "../dist/app/index.js";
import {
  textContent,
} from "../dist/channels/index.js";
import {
  getSkillPromptResources,
  getSkillView,
  inspectSkills,
  listSkillViews,
  loadSkillPrompt,
} from "../dist/skills/index.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-skill-command-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("skill context inspection", () => {
  test("context command can render a skill through the shared context path", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--agent", "mechanic", "--skill", "setup"], readWorkspaceConfig())
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /Shrimpy Setup/);
  });

  test("context command renders separate turn context and user message previews", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--channel", "home", "hello"], { workspace } as any)
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /## Delivery/);
    assert.match(output, /send_message\(channel="home", text="\.\.\."\)/);
    assert.match(output, /=== Turn Context ===\n\n\[turn-context\]/);
    assert.match(output, /=== User Message ===/);
    assert.match(output, /\[channel: home, sender: human:\(user\)\]\nhello/);
    assert.doesNotMatch(output, /\[incoming\]/);
  });

  test("context command can inspect session and turn sections as json", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--agent", "mechanic", "--channel", "home", "--json", "hello"], readWorkspaceConfig())
    );

    assert.equal(result, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.ok(parsed.promptSections.some((section: any) => section.id === "base:SOUL.md"));
    assert.ok(parsed.promptSections.some((section: any) =>
      section.id === "session:runtime_environment" && section.kind === "runtime"
    ));
    assert.deepEqual(
      [...new Set(parsed.promptSections.map((section: any) => section.kind))].sort(),
      ["capability", "identity", "memory", "runtime"],
    );
    assert.ok(parsed.promptSections.some((section: any) =>
      section.id === "pi:available_skills" && section.kind === "capability"
    ));
    assert.ok(parsed.promptSections.some((section: any) =>
      section.id === "pi:runtime_facts" && section.kind === "runtime"
    ));
    assert.equal(parsed.contextLayers, undefined);
    assert.equal(parsed.turnContext.sessionType, "gateway");
    assert.match(parsed.systemPrompt, /\[context pi:available_skills capability\]/);
    assert.match(parsed.systemPrompt, /<available_skills>/);
    assert.match(parsed.systemPrompt, /<name>setup<\/name>/);
    assert.match(parsed.systemPrompt, /<name>mechanic<\/name>/);
    assert.match(parsed.systemPrompt, /<name>watches<\/name>/);
    assert.match(parsed.systemPrompt, /<name>workspace-migration<\/name>/);
    assert.match(parsed.systemPrompt, /<name>security-audit<\/name>/);
    assert.match(parsed.systemPrompt, /<name>hygiene-audit<\/name>/);
    assert.match(parsed.systemPrompt, /<name>coding-delegation<\/name>/);
    assert.match(parsed.systemPrompt, /<name>memory-management<\/name>/);
    assert.match(parsed.systemPrompt, /\[context pi:runtime_facts runtime\]/);
    assert.match(parsed.systemPrompt, /Current time: .*; UTC: \d{4}-\d{2}-\d{2}T/);
    assert.match(parsed.systemPrompt, new RegExp(`\\(${Intl.DateTimeFormat().resolvedOptions().timeZone}, UTC[+-]\\d{2}:\\d{2}\\)`));
    assert.match(parsed.systemPrompt, /Current working directory:/);
    assert.match(parsed.systemPrompt, /\[end context\]$/);
    assert.match(parsed.shrimpySystemPrompt, /# SOUL/);
    assert.doesNotMatch(parsed.shrimpySystemPrompt, /<available_skills>/);
    assert.doesNotMatch(parsed.systemPrompt, /\*\*model_id\*\*/);
    assert.doesNotMatch(parsed.systemPrompt, /\*\*provider\*\*/);
    assert.doesNotMatch(parsed.systemPrompt, /Load a skill when/);
    assert.doesNotMatch(parsed.systemPrompt, /\| Skill \| Scope \| Description \|/);
    assert.match(parsed.turnContext.text, /^\[turn-context\]/);
    assert.equal(parsed.userMessage, "[channel: home, sender: human:(user)]\nhello");
    assert.doesNotMatch(parsed.userMessage, /\[incoming\]/);
  });

  test("context turn subcommand can render only turn context", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["turn", "--channel", "home"], { workspace } as any)
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /^\[turn-context\]/);
    assert.match(output, /session: gateway channel: home/);
    assert.doesNotMatch(output, /## Prompt Sections/);
    assert.doesNotMatch(output, /=== System Prompt ===/);
  });

  test("context turn preview includes channel unread context", async () => {
    await setupInit(workspace);
    const runtime = createAppRuntime({ workspace });
    const channelBus = runtime.createChannelBus();
    channelBus.publish({
      channel: "home",
      sender: {
        kind: "human",
        actorId: "human:user",
      },
      origin: {
        transport: "cli",
      },
      content: textContent("old thread"),
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
    });

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--channel", "home", "--json", "new followup"], { workspace } as any)
    );

    assert.equal(result, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.match(parsed.turnContext.text, /home: 2 new messages/);
    assert.match(parsed.turnContext.text, /inspect: shrimpy channels read home/);
  });

  test("context sources list exposes configured and runtime sources", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["sources", "list", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.ok(parsed.some((source: any) =>
      source.id === "file:workspace:profile/WORKSPACE.md" &&
      source.type === "file" &&
      source.scope === "session"
    ));
    assert.ok(parsed.some((source: any) =>
      source.id === "directory:agent:context/" &&
      source.type === "directory" &&
      source.scope === "session"
    ));
    assert.ok(parsed.some((source: any) =>
      source.id === "runtime:turn-context" &&
      source.type === "runtime" &&
      source.scope === "turn"
    ));
  });

  test("context sources run renders file and directory sources through prompt sections", async () => {
    await setupInit(workspace);

    const fileRun = await captureLogs(() =>
      cmdContext(
        ["sources", "run", "file:workspace:profile/WORKSPACE.md"],
        { workspace } as any,
      )
    );
    const dirRun = await captureLogs(() =>
      cmdContext(
        ["sources", "run", "directory:agent:context/"],
        { workspace } as any,
      )
    );

    const fileOutput = fileRun.lines.join("\n");
    const dirOutput = dirRun.lines.join("\n");
    assert.equal(fileRun.result, 0);
    assert.equal(dirRun.result, 0);
    assert.match(fileOutput, /^\[context base:profile\/WORKSPACE\.md identity\]/);
    assert.match(dirOutput, /\[context base:context\/habits\.md memory\]/);
    assert.doesNotMatch(dirOutput, /\[context base:context\/identity\.md memory\]/);
    assert.doesNotMatch(fileOutput, /^## profile\/WORKSPACE\.md/m);
    assert.doesNotMatch(dirOutput, /^## context\//m);
  });

  test("context sources run executes command sources", async () => {
    await setupInit(workspace);
    const configPath = join(workspace, "config", "shrimpy.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.context.sources.push({
      type: "command",
      id: "test.command",
      command: "node -e \"console.log([process.env.SHRIMPY_CONTEXT_AGENT, process.env.SHRIMPY_CONTEXT_CHANNEL, process.env.SHRIMPY_CONTEXT_SESSION_TYPE].join(':'))\"",
      channels: ["home"],
      maxChars: 100,
    });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["sources", "run", "test.command", "--channel", "home", "--session-type", "watch"],
        { ...config, workspace } as any,
      )
    );

    assert.equal(result, 0);
    assert.equal(lines.join("\n"), "shrimpy:home:watch");
  });

  test("context sources run exposes parsed command items as json", async () => {
    await setupInit(workspace);
    const configPath = join(workspace, "config", "shrimpy.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.context.sources.push({
      type: "command",
      id: "json.command",
      command: "node -e \"console.log(JSON.stringify({summary:'parsed item',inspect:'shrimpy context sources run json.command'}))\"",
      maxChars: 200,
    });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["sources", "run", "json.command", "--json"],
        { ...config, workspace } as any,
      )
    );

    assert.equal(result, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.id, "json.command");
    assert.equal(parsed.output, "{\"summary\":\"parsed item\",\"inspect\":\"shrimpy context sources run json.command\"}");
    assert.deepEqual(parsed.items, [{
      id: "command:json.command:0",
      summary: "parsed item",
      inspect: "shrimpy context sources run json.command",
    }]);
  });

  test("context sources run reports command failures as inspectable json", async () => {
    await setupInit(workspace);
    const configPath = join(workspace, "config", "shrimpy.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.context.sources.push({
      type: "command",
      id: "broken.command",
      command: "node -e \"throw new Error('broken source')\"",
      maxChars: 200,
    });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["sources", "run", "broken.command", "--json"],
        { ...config, workspace } as any,
      )
    );

    assert.equal(result, 1);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.id, "broken.command");
    assert.equal(parsed.output, "");
    assert.match(parsed.error, /broken source/);
    assert.equal(parsed.items[0].id, "command:broken.command:error");
    assert.match(parsed.items[0].summary, /broken.command: context command failed/);
    assert.equal(parsed.items[0].inspect, "node -e \"throw new Error('broken source')\"");
  });

  test("context sources run runtime source honors session type", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["sources", "run", "runtime:turn-context", "--channel", "home", "--session-type", "watch"],
        { workspace } as any,
      )
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /session: watch channel: home/);
  });

  test("context command renders section manifest for turn previews", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--channel", "home", "--turn", "hello"], { workspace } as any)
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /## Prompt Sections/);
    assert.match(output, /\[identity\]/);
    assert.match(output, /\[runtime\]/);
    assert.match(output, /\[turn-context\]/);
    assert.match(output, /=== System Prompt ===/);
    assert.match(output, /<available_skills>/);
    assert.match(output, /=== User Message ===/);
  });

  test("context turn subcommand renders turn context without a prompt", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["turn", "--channel", "home"], { workspace } as any)
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /^\[turn-context\]/);
    assert.doesNotMatch(output, /## Prompt Sections/);
    assert.doesNotMatch(output, /=== System Prompt ===/);
    assert.doesNotMatch(output, /=== User Message ===/);
  });

  test("skills command lists agent and workspace skills", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdSkills(["list", "--agent", "mechanic"], readWorkspaceConfig())
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /setup \[default\]/);
    assert.match(lines.join("\n"), /mechanic \[default\]/);
    assert.match(lines.join("\n"), /add-agent \[default\]/);
    assert.match(lines.join("\n"), /channel-routing \[default\]/);
    assert.match(lines.join("\n"), /hygiene-audit \[default\]/);
    assert.match(lines.join("\n"), /watches \[default\]/);
    assert.match(lines.join("\n"), /security-audit \[default\]/);
    assert.match(lines.join("\n"), /workspace-migration \[default\]/);
    assert.match(lines.join("\n"), /shrimpy-mechanic-ideas \[default\]/);
    assert.match(lines.join("\n"), /Add or configure a Shrimpy agent/);
    assert.match(lines.join("\n"), /memory-management \[default\]/);
    assert.match(lines.join("\n"), /coding-delegation \[default\]/);
    assert.match(lines.join("\n"), /Periodic upkeep of my own context\/ directory/);
    assert.match(lines.join("\n"), /journal-daily \[default\]/);
    assert.match(lines.join("\n"), /journal-compact \[default\]/);
    assert.doesNotMatch(lines.join("\n"), /activity-summary/);
  });

  test("maintenance skills are not visible to the default shrimpy agent", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdSkills(["list", "--agent", "shrimpy"], readWorkspaceConfig())
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /memory-management \[default\]/);
    assert.match(output, /coding-delegation \[default\]/);
    assert.match(output, /journal-daily \[default\]/);
    assert.match(output, /journal-compact \[default\]/);
    assert.doesNotMatch(output, /add-agent/);
    assert.doesNotMatch(output, /mechanic \[agent\]/);
    assert.doesNotMatch(output, /channel-routing/);
    assert.doesNotMatch(output, /hygiene-audit/);
    assert.doesNotMatch(output, /watches/);
    assert.doesNotMatch(output, /security-audit/);
    assert.doesNotMatch(output, /workspace-migration/);
    assert.doesNotMatch(output, /shrimpy-mechanic-ideas/);
  });

  test("skills command can scaffold and validate a workspace skill", async () => {
    await setupInit(workspace);

    const add = await captureLogs(() =>
      cmdSkills(
        ["new", "meal-plan", "--description", "Plan weekly meals."],
        { workspace } as any,
      )
    );
    assert.equal(add.result, 0);
    const skillPath = join(workspace, "skills", "meal-plan", "SKILL.md");
    assert.equal(existsSync(skillPath), true);
    assert.match(readFileSync(skillPath, "utf-8"), /name: meal-plan/);

    const validate = await captureLogs(() =>
      cmdSkills(["validate", "meal-plan"], { workspace } as any)
    );
    assert.equal(validate.result, 0);
    assert.match(validate.lines.join("\n"), /skills validation passed/);
  });

  test("skills command adds local packages without overwriting by default", async () => {
    await setupInit(workspace);
    const source = mkdtempSync(join(tmpdir(), "shrimpy-skill-source-"));
    const invalidSource = mkdtempSync(join(tmpdir(), "shrimpy-invalid-skill-source-"));
    mkdirSync(join(source, "scripts"), { recursive: true });
    writeFileSync(
      join(source, "SKILL.md"),
      [
        "---",
        "name: source-skill",
        "description: Source skill for install tests.",
        "---",
        "",
        "# Source Skill",
        "",
      ].join("\n"),
      "utf-8",
    );

    try {
      await assert.rejects(
        () => cmdSkills(["add", invalidSource, "--id", "invalid-source", "--agent", "shrimpy"], { workspace } as any),
        /missing SKILL\.md/,
      );
      assert.equal(existsSync(join(workspace, "state", "skills", "packages", "invalid-source")), false);

      const install = await captureLogs(() =>
        cmdSkills(
          ["add", source, "--id", "source-skill", "--agent", "shrimpy"],
          { workspace } as any,
        )
      );
      assert.equal(install.result, 0);
      const installedPath = join(workspace, "state", "skills", "packages", "source-skill", "SKILL.md");
      assert.equal(existsSync(installedPath), true);
      const packages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(packages.packages["source-skill"].source, source);
      const bindings = JSON.parse(readFileSync(join(workspace, "state", "skills", "bindings.json"), "utf-8"));
      assert.deepEqual(bindings.agents.shrimpy, ["source-skill"]);

      await assert.rejects(
        () => cmdSkills(["add", source, "--id", "source-skill", "--agent", "shrimpy"], { workspace } as any),
        /skill package already exists/,
      );

      const originalInstalledContent = readFileSync(installedPath, "utf-8");
      writeFileSync(
        join(invalidSource, "SKILL.md"),
        [
          "---",
          "name: wrong-source-skill",
          "description: Mismatched skill for force replacement tests.",
          "---",
          "",
          "# Wrong Source Skill",
          "",
        ].join("\n"),
        "utf-8",
      );
      await assert.rejects(
        () => cmdSkills(
          ["add", invalidSource, "--id", "source-skill", "--agent", "shrimpy", "--force"],
          { workspace } as any,
        ),
        /must match Pi skill name/,
      );
      assert.equal(readFileSync(installedPath, "utf-8"), originalInstalledContent);
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(invalidSource, { recursive: true, force: true });
    }
  });

  test("skills command discovers and updates GitHub packages", async () => {
    await setupInit(workspace);
    const github = mockGitHubRepo({
      owner: "octo",
      repo: "skills",
      branch: "main",
      commitSha: "commit-one",
      skills: {
        "skills/alpha": {
          treeSha: "tree-alpha-v1",
          blobSha: "blob-alpha-v1",
          content: [
            "---",
            "name: alpha",
            "description: Alpha GitHub skill.",
            "---",
            "",
            "# Alpha",
            "",
          ].join("\n"),
          files: {
            "assets/pixel.bin": Buffer.from([0, 255, 1, 2]),
          },
        },
        "skills/beta": {
          treeSha: "tree-beta-v1",
          blobSha: "blob-beta-v1",
          content: [
            "---",
            "name: beta",
            "description: Beta GitHub skill.",
            "---",
            "",
            "# Beta",
            "",
          ].join("\n"),
        },
      },
    });

    try {
      await assert.rejects(
        () => cmdSkills(["add", "octo/skills", "--agent", "shrimpy"], { workspace } as any),
        /multiple skills found/,
      );

      const dryRun = await captureLogs(() =>
        cmdSkills(["add", "octo/skills", "--dry-run", "--json"], { workspace } as any)
      );
      assert.equal(dryRun.result, 0);
      const dryRunJson = JSON.parse(dryRun.lines.join("\n"));
      assert.equal(dryRunJson.dryRun, true);
      assert.deepEqual(
        dryRunJson.candidates.map((candidate: any) => [candidate.id, candidate.path, candidate.sourceRevision]),
        [
          ["alpha", "skills/alpha", "tree-alpha-v1"],
          ["beta", "skills/beta", "tree-beta-v1"],
        ],
      );
      assert.equal(existsSync(join(workspace, "state", "skills", "packages.json")), false);

      const dryRunAll = await captureLogs(() =>
        cmdSkills(["add", "octo/skills", "--dry-run", "--all", "--json"], { workspace } as any)
      );
      assert.equal(dryRunAll.result, 0);
      const dryRunAllJson = JSON.parse(dryRunAll.lines.join("\n"));
      assert.deepEqual(
        dryRunAllJson.selectedCandidates.map((candidate: any) => candidate.id),
        ["alpha", "beta"],
      );
      assert.equal(existsSync(join(workspace, "state", "skills", "packages.json")), false);

      const install = await captureLogs(() =>
        cmdSkills(["add", "octo/skills", "--path", "skills/alpha", "--agent", "shrimpy"], { workspace } as any)
      );
      assert.equal(install.result, 0);
      const installedPath = join(workspace, "state", "skills", "packages", "alpha", "SKILL.md");
      assert.equal(existsSync(installedPath), true);
      assert.match(readFileSync(installedPath, "utf-8"), /# Alpha/);
      assert.deepEqual(
        readFileSync(join(workspace, "state", "skills", "packages", "alpha", "assets", "pixel.bin")),
        Buffer.from([0, 255, 1, 2]),
      );
      const packages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(packages.packages.alpha.sourceKind, "github");
      assert.equal(packages.packages.alpha.sourceRevision, "tree-alpha-v1");
      assert.equal(packages.packages.alpha.github.owner, "octo");
      assert.equal(packages.packages.alpha.github.repo, "skills");
      assert.equal(packages.packages.alpha.github.path, "skills/alpha");
      const bindings = JSON.parse(readFileSync(join(workspace, "state", "skills", "bindings.json"), "utf-8"));
      assert.deepEqual(bindings.agents.shrimpy, ["alpha"]);

      const bindAgent = await captureLogs(() =>
        cmdSkills(["bind", "alpha", "--agent", "mechanic", "--json"], readWorkspaceConfig())
      );
      assert.equal(bindAgent.result, 0);
      const bindAgentJson = JSON.parse(bindAgent.lines.join("\n"));
      assert.equal(bindAgentJson.id, "alpha");
      assert.equal(bindAgentJson.scope, "agent");
      assert.equal(bindAgentJson.agentId, "mechanic");
      assert.deepEqual(bindAgentJson.bindings.agents.mechanic, ["alpha"]);
      const mechanicRuntime = createAppRuntime(readWorkspaceConfig());
      assert.equal(getSkillView(mechanicRuntime, "alpha", "mechanic").scope, "package");

      const bindWorkspace = await captureLogs(() =>
        cmdSkills(["bind", "alpha", "--workspace"], { workspace } as any)
      );
      assert.equal(bindWorkspace.result, 0);
      assert.match(bindWorkspace.lines.join("\n"), /Bound skill package alpha to workspace/);
      const workspaceBindings = JSON.parse(readFileSync(join(workspace, "state", "skills", "bindings.json"), "utf-8"));
      assert.deepEqual(workspaceBindings.workspace, ["alpha"]);

      const unbindShrimpy = await captureLogs(() =>
        cmdSkills(["unbind", "alpha", "--agent", "shrimpy"], { workspace } as any)
      );
      assert.equal(unbindShrimpy.result, 0);
      assert.match(unbindShrimpy.lines.join("\n"), /Unbound skill package alpha from agent shrimpy/);
      const unbindMechanic = await captureLogs(() =>
        cmdSkills(["unbind", "alpha", "--agent", "mechanic"], readWorkspaceConfig())
      );
      assert.equal(unbindMechanic.result, 0);
      const unbindWorkspace = await captureLogs(() =>
        cmdSkills(["unbind", "alpha", "--workspace", "--json"], { workspace } as any)
      );
      assert.equal(unbindWorkspace.result, 0);
      const unbindWorkspaceJson = JSON.parse(unbindWorkspace.lines.join("\n"));
      assert.deepEqual(unbindWorkspaceJson.bindings.workspace, []);
      assert.equal(existsSync(installedPath), true);
      const clearedBindings = JSON.parse(readFileSync(join(workspace, "state", "skills", "bindings.json"), "utf-8"));
      assert.deepEqual(clearedBindings.agents.shrimpy, []);
      assert.deepEqual(clearedBindings.agents.mechanic, []);
      assert.deepEqual(clearedBindings.workspace, []);

      github.updateSkill("skills/alpha", {
        treeSha: "tree-alpha-v2",
        blobSha: "blob-alpha-v2",
        content: [
          "---",
          "name: alpha",
          "description: Alpha GitHub skill v2.",
          "---",
          "",
          "# Alpha V2",
          "",
        ].join("\n"),
      });
      const updateDryRun = await captureLogs(() =>
        cmdSkills(["update", "alpha", "--dry-run", "--json"], { workspace } as any)
      );
      assert.equal(updateDryRun.result, 0);
      const updateDryRunJson = JSON.parse(updateDryRun.lines.join("\n"));
      assert.equal(updateDryRunJson.updateAvailable, true);
      assert.equal(updateDryRunJson.current.sourceRevision, "tree-alpha-v1");
      assert.equal(updateDryRunJson.latest.sourceRevision, "tree-alpha-v2");
      assert.match(readFileSync(installedPath, "utf-8"), /# Alpha/);
      assert.doesNotMatch(readFileSync(installedPath, "utf-8"), /# Alpha V2/);

      const update = await captureLogs(() =>
        cmdSkills(["update", "alpha"], { workspace } as any)
      );
      assert.equal(update.result, 0);
      assert.match(update.lines.join("\n"), /Updated skill package alpha/);
      assert.match(readFileSync(installedPath, "utf-8"), /# Alpha V2/);
      const updatedPackages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(updatedPackages.packages.alpha.sourceRevision, "tree-alpha-v2");
      const updatedBindings = JSON.parse(readFileSync(join(workspace, "state", "skills", "bindings.json"), "utf-8"));
      assert.deepEqual(updatedBindings.agents.shrimpy, []);
      assert.deepEqual(updatedBindings.agents.mechanic, []);
      assert.deepEqual(updatedBindings.workspace, []);
    } finally {
      github.restore();
    }
  });

  test("skills validation fails when directory id and Pi name differ", async () => {
    await setupInit(workspace);
    const root = join(workspace, "skills", "public-name");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "SKILL.md"),
      [
        "---",
        "name: pi-name",
        "description: Mismatched skill for validation tests.",
        "---",
        "",
        "# Mismatch",
        "",
      ].join("\n"),
      "utf-8",
    );

    const validate = await captureLogs(() =>
      cmdSkills(["validate", "public-name"], { workspace } as any)
    );
    assert.equal(validate.result, 1);
    assert.match(validate.lines.join("\n"), /\[error\] public-name skill id "public-name" must match Pi skill name "pi-name"/);
  });

  test("skills validation warns for large effective skill sets", async () => {
    await setupInit(workspace);
    for (let index = 0; index < 21; index += 1) {
      const id = `bulk-${String(index).padStart(2, "0")}`;
      const root = join(workspace, "skills", id);
      mkdirSync(root, { recursive: true });
      writeFileSync(
        join(root, "SKILL.md"),
        [
          "---",
          `name: ${id}`,
          `description: Bulk skill ${index}.`,
          "---",
          "",
          `# ${id}`,
          "",
        ].join("\n"),
        "utf-8",
      );
    }

    const validate = await captureLogs(() =>
      cmdSkills(["validate"], { workspace } as any)
    );
    assert.equal(validate.result, 0);
    assert.match(validate.lines.join("\n"), /effective skills will be advertised to Pi/);
  });
});

describe("skill service", () => {
  test("discovers and loads skills from agent and workspace scopes", async () => {
    await setupInit(workspace);
    const runtime = createAppRuntime(readWorkspaceConfig());

    const skills = listSkillViews(runtime, "mechanic");
    assert.deepEqual(skills.map((skill) => `${skill.id}:${skill.scope}`), [
      "add-agent:default",
      "channel-routing:default",
      "coding-delegation:default",
      "hygiene-audit:default",
      "journal-compact:default",
      "journal-daily:default",
      "mechanic:default",
      "memory-management:default",
      "security-audit:default",
      "setup:default",
      "shrimpy-mechanic-ideas:default",
      "watches:default",
      "workspace-migration:default",
    ]);

    const shrimpySkills = listSkillViews(runtime, "shrimpy");
    assert.deepEqual(shrimpySkills.map((skill) => `${skill.id}:${skill.scope}`), [
      "coding-delegation:default",
      "journal-compact:default",
      "journal-daily:default",
      "memory-management:default",
    ]);

    const skill = getSkillView(runtime, "setup", "mechanic");
    assert.match(skill.entryPath, /src\/setup\/templates\/mechanic\/skills\/setup\/SKILL\.md$/);
    assert.equal(skill.loaded, true);
    assert.match(loadSkillPrompt(runtime, "setup", "mechanic"), /first usable Shrimpy workspace/);
    const securityAudit = getSkillView(runtime, "security-audit", "mechanic");
    assert.equal(securityAudit.loaded, true);
    assert.match(loadSkillPrompt(runtime, "security-audit", "mechanic"), /agents\/mechanic\/vault\/audits/);
    const hygieneAudit = getSkillView(runtime, "hygiene-audit", "mechanic");
    assert.equal(hygieneAudit.loaded, true);
    assert.match(loadSkillPrompt(runtime, "hygiene-audit", "mechanic"), /checked, found nothing/);
    const codingDelegation = getSkillView(runtime, "coding-delegation", "shrimpy");
    assert.equal(codingDelegation.available, true);
    assert.deepEqual(codingDelegation.requiredTools, ["bash"]);
    assert.deepEqual(getSkillPromptResources(runtime, "setup", "mechanic"), [{
      rootPath: join(projectRoot, "src", "setup", "templates", "mechanic"),
      resourcePath: "skills/setup",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "add-agent", "mechanic"), [{
      rootPath: join(projectRoot, "src", "setup", "templates", "mechanic"),
      resourcePath: "skills/add-agent",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "security-audit", "mechanic"), [{
      rootPath: join(projectRoot, "src", "setup", "templates", "mechanic"),
      resourcePath: "skills/security-audit",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "hygiene-audit", "mechanic"), [{
      rootPath: join(projectRoot, "src", "setup", "templates", "mechanic"),
      resourcePath: "skills/hygiene-audit",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "memory-management"), [{
      rootPath: join(projectRoot, "src", "setup", "templates"),
      resourcePath: "skills/memory-management",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "coding-delegation"), [{
      rootPath: join(projectRoot, "src", "setup", "templates"),
      resourcePath: "skills/coding-delegation",
    }]);
  });

  test("rejects invalid skill ids", async () => {
    await setupInit(workspace);
    const runtime = createAppRuntime(readWorkspaceConfig());

    assert.throws(() => getSkillView(runtime, "bad~name"), /invalid skill id/);
  });

  test("keeps manually authored agent skills additive", async () => {
    await setupInit(workspace);
    const root = join(workspace, "agents", "shrimpy", "skills", "meal-plan");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "SKILL.md"),
      [
        "---",
        "name: meal-plan",
        "description: Plan meals from pantry context.",
        "---",
        "",
        "# Meal Plan",
        "",
      ].join("\n"),
      "utf-8",
    );

    const runtime = createAppRuntime(readWorkspaceConfig());
    const skill = getSkillView(runtime, "meal-plan", "shrimpy");
    assert.equal(skill.scope, "agent");
    assert.equal(skill.sourceKind, "local");
    assert.equal(skill.available, true);
    assert.match(loadSkillPrompt(runtime, "meal-plan", "shrimpy"), /Meal Plan/);
  });

  test("tool gating keeps incompatible skills out of Pi", async () => {
    await setupInit(workspace);
    const root = join(workspace, "skills", "needs-browser");
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "SKILL.md"),
      [
        "---",
        "name: needs-browser",
        "description: Requires browser automation.",
        "allowed-tools: Browser",
        "---",
        "",
        "# Needs Browser",
        "",
      ].join("\n"),
      "utf-8",
    );

    const runtime = createAppRuntime(readWorkspaceConfig());
    const skill = getSkillView(runtime, "needs-browser", "shrimpy");
    assert.equal(skill.available, false);
    assert.deepEqual(skill.missingTools, ["browser"]);

    const bootstrap = await runtime.createBootstrap({
      agentId: "shrimpy",
      cwd: workspace,
    });
    const piSkillNames = bootstrap.resourceLoader.getSkills().skills
      .map((loadedSkill: any) => loadedSkill.name);
    assert.equal(piSkillNames.includes("needs-browser"), false);
  });

  test("wires Shrimpy skills into Pi while ignoring ambient cwd skills", async () => {
    await setupInit(workspace);
    const ambientRoot = join(workspace, ".pi", "skills", "ambient");
    mkdirSync(ambientRoot, { recursive: true });
    writeFileSync(
      join(ambientRoot, "SKILL.md"),
      [
        "---",
        "name: ambient",
        "description: Should not load through Shrimpy.",
        "---",
        "",
        "# Ambient",
        "",
      ].join("\n"),
      "utf-8",
    );

    const runtime = createAppRuntime(readWorkspaceConfig());
    const bootstrap = await runtime.createBootstrap({
      agentId: "mechanic",
      cwd: workspace,
    });
    const piSkillNames = bootstrap.resourceLoader.getSkills().skills
      .map((skill: any) => skill.name)
      .sort();

    assert.deepEqual(piSkillNames, [
      "add-agent",
      "channel-routing",
      "coding-delegation",
      "hygiene-audit",
      "journal-compact",
      "journal-daily",
      "mechanic",
      "memory-management",
      "security-audit",
      "setup",
      "shrimpy-mechanic-ideas",
      "watches",
      "workspace-migration",
    ]);
    assert.deepEqual(inspectSkills(runtime, "mechanic").warnings, []);
  });
});

function readWorkspaceConfig(): any {
  return {
    ...JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    ),
    workspace,
  };
}

function mockGitHubRepo(opts: {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  skills: Record<string, MockGitHubSkill>;
}): {
  updateSkill: (path: string, skill: MockGitHubSkill) => void;
  restore: () => void;
} {
  const originalFetch = globalThis.fetch;
  const skills = new Map(Object.entries(opts.skills));
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input);
    const base = `https://api.github.com/repos/${opts.owner}/${opts.repo}`;
    if (url === base) {
      return jsonResponse({ default_branch: opts.branch });
    }
    if (url === `${base}/commits/${opts.branch}`) {
      return jsonResponse({ sha: opts.commitSha });
    }
    if (url === `${base}/git/trees/${opts.commitSha}?recursive=1`) {
      return jsonResponse({
        sha: "root-tree",
        truncated: false,
        tree: gitHubTreeEntries(skills),
      });
    }
    const blobPrefix = `${base}/git/blobs/`;
    if (url.startsWith(blobPrefix)) {
      const sha = url.slice(blobPrefix.length);
      for (const [path, skill] of skills) {
        if (skill.blobSha === sha) {
          return jsonResponse({
            encoding: "base64",
            content: Buffer.from(skill.content, "utf-8").toString("base64"),
          });
        }
        for (const [relativePath, content] of Object.entries(skill.files ?? {})) {
          if (mockGitHubExtraBlobSha(path, relativePath) === sha) {
            return jsonResponse({
              encoding: "base64",
              content: Buffer.isBuffer(content)
                ? content.toString("base64")
                : Buffer.from(content, "utf-8").toString("base64"),
            });
          }
        }
      }
    }
    return new Response(JSON.stringify({ message: "not found" }), {
      status: 404,
      statusText: "Not Found",
      headers: { "content-type": "application/json" },
    });
  };
  return {
    updateSkill(path, skill) {
      skills.set(path, skill);
    },
    restore() {
      globalThis.fetch = originalFetch;
    },
  };
}

interface MockGitHubSkill {
  treeSha: string;
  blobSha: string;
  content: string;
  files?: Record<string, string | Buffer>;
}

function gitHubTreeEntries(
  skills: Map<string, MockGitHubSkill>,
): Array<{ path: string; mode: string; type: "blob" | "tree"; sha: string }> {
  const directories = new Map<string, string>();
  const blobs: Array<{ path: string; mode: string; type: "blob"; sha: string }> = [];
  for (const [path, skill] of skills) {
    const segments = path.split("/");
    for (let index = 1; index <= segments.length; index += 1) {
      const directory = segments.slice(0, index).join("/");
      directories.set(directory, index === segments.length ? skill.treeSha : `tree-${directory}`);
    }
    blobs.push({
      path: `${path}/SKILL.md`,
      mode: "100644",
      type: "blob",
      sha: skill.blobSha,
    });
    for (const relativePath of Object.keys(skill.files ?? {})) {
      const relativeSegments = relativePath.split("/").filter(Boolean);
      for (let index = 1; index < relativeSegments.length; index += 1) {
        const directory = `${path}/${relativeSegments.slice(0, index).join("/")}`;
        if (!directories.has(directory)) {
          directories.set(directory, `tree-${directory}`);
        }
      }
      blobs.push({
        path: `${path}/${relativePath}`,
        mode: "100644",
        type: "blob",
        sha: mockGitHubExtraBlobSha(path, relativePath),
      });
    }
  }
  return [
    ...[...directories.entries()].map(([path, sha]) => ({
      path,
      mode: "040000",
      type: "tree" as const,
      sha,
    })),
    ...blobs,
  ].sort((a, b) => a.path.localeCompare(b.path));
}

function mockGitHubExtraBlobSha(path: string, relativePath: string): string {
  return `blob-extra-${path}-${relativePath}`.replace(/[^A-Za-z0-9_.-]/g, "-");
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
