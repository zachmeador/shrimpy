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

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-skill-command-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[]; errors: string[] }> {
  const originalLog = console.log;
  const originalError = console.error;
  const lines: string[] = [];
  const errors: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const result = await fn();
    return { result, lines, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

describe("skill context inspection", () => {
  test("context command can render a skill through the shared context path", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--skill", "setup"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /Shrimpy Setup Skill/);
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
      cmdContext(["--channel", "home", "--json", "hello"], { workspace } as any)
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
    assert.match(parsed.systemPrompt, /<name>memory-management<\/name>/);
    assert.match(parsed.systemPrompt, /\[context pi:runtime_facts runtime\]/);
    assert.match(parsed.systemPrompt, /Current date: \d{4}-\d{2}-\d{2}/);
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
    assert.match(dirOutput, /\[context base:context\/identity\.md memory\]/);
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
      cmdSkills(["list"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /setup \[agent\]/);
    assert.match(lines.join("\n"), /add-agent \[workspace\]/);
    assert.match(lines.join("\n"), /Add or configure a Shrimpy agent/);
    assert.match(lines.join("\n"), /memory-management \[workspace\]/);
    assert.match(lines.join("\n"), /Periodic upkeep of my own context\/ directory/);
    assert.match(lines.join("\n"), /journal-daily \[workspace\]/);
    assert.match(lines.join("\n"), /journal-compact \[workspace\]/);
    assert.doesNotMatch(lines.join("\n"), /activity-summary/);
  });

  test("skills command can scaffold and validate a workspace skill", async () => {
    await setupInit(workspace);

    const add = await captureLogs(() =>
      cmdSkills(
        ["add", "meal-plan", "--description", "Plan weekly meals."],
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

  test("skills command installs local bundles without overwriting by default", async () => {
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
        () => cmdSkills(["install", invalidSource, "--id", "invalid-source"], { workspace } as any),
        /missing SKILL\.md/,
      );
      assert.equal(existsSync(join(workspace, "skills", "invalid-source")), false);

      const install = await captureLogs(() =>
        cmdSkills(
          ["install", source, "--id", "source-skill"],
          { workspace } as any,
        )
      );
      assert.equal(install.result, 0);
      const installedPath = join(workspace, "skills", "source-skill", "SKILL.md");
      assert.equal(existsSync(installedPath), true);

      await assert.rejects(
        () => cmdSkills(["install", source, "--id", "source-skill"], { workspace } as any),
        /skill already exists/,
      );
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(invalidSource, { recursive: true, force: true });
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
    const runtime = createAppRuntime({ workspace });

    const skills = listSkillViews(runtime);
    assert.deepEqual(skills.map((skill) => `${skill.id}:${skill.scope}`), [
      "add-agent:workspace",
      "journal-compact:workspace",
      "journal-daily:workspace",
      "memory-management:workspace",
      "setup:agent",
    ]);

    const skill = getSkillView(runtime, "setup");
    assert.match(skill.entryPath, /agents\/shrimpy\/skills\/setup\/SKILL\.md$/);
    assert.equal(skill.loaded, true);
    assert.match(loadSkillPrompt(runtime, "setup"), /first usable Shrimpy config/);
    assert.deepEqual(getSkillPromptResources(runtime, "setup"), [{
      rootPath: join(workspace, "agents", "shrimpy"),
      resourcePath: "skills/setup",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "memory-management"), [{
      rootPath: workspace,
      resourcePath: "skills/memory-management",
    }]);
  });

  test("rejects invalid skill ids", async () => {
    await setupInit(workspace);
    const runtime = createAppRuntime({ workspace });

    assert.throws(() => getSkillView(runtime, "bad~name"), /invalid skill id/);
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

    const runtime = createAppRuntime({ workspace });
    const bootstrap = await runtime.createBootstrap({
      cwd: workspace,
    });
    const piSkillNames = bootstrap.resourceLoader.getSkills().skills
      .map((skill: any) => skill.name)
      .sort();

    assert.deepEqual(piSkillNames, [
      "add-agent",
      "journal-compact",
      "journal-daily",
      "memory-management",
      "setup",
    ]);
    assert.deepEqual(inspectSkills(runtime).warnings, []);
  });
});
