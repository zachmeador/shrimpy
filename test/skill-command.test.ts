import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  chmodSync,
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
import { setupInit } from "./helpers.ts";
import { createAppRuntime } from "../dist/app/runtime.js";
import { projectRoot } from "../dist/app/project-root.js";
import { textContent } from "../dist/channels/messages.js";
import { createLocalSessionKey } from "../dist/sessions/identity.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";
import { ensureSessionManifest } from "../dist/sessions/manifest.js";
import { getSkillPromptResources, getSkillView, inspectSkills, listSkillViews, loadSkillPrompt } from "../dist/skills/catalog.js";
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
      cmdContext(["--agent", "mechanic", "--skill", "shrimpy-setup"], readWorkspaceConfig())
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /Shrimpy Setup/);
  });

  test("context json identifies explicitly selected skills", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["--agent", "mechanic", "--skill", "shrimpy-setup", "--json"],
        readWorkspaceConfig(),
      )
    );

    assert.equal(result, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.deepEqual(parsed.selectedSkills, ["shrimpy-setup"]);
    assert.match(parsed.context.systemPrompt, /Shrimpy Setup/);
  });

  test("context command renders turn context with the user message", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--channel", "home", "hello"], { workspace } as any)
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /## Delivery/);
    assert.match(output, /send_message\(channel="home", text="\.\.\."\)/);
    assert.match(output, /\[turn-context\]/);
    assert.match(output, /The turn context above is background for the user message below/);
    assert.match(output, /\[turn-context\][\s\S]*\[channel: home, sender: human:\(user\)\]\nhello/);
    assert.doesNotMatch(output, /=== Turn Context|=== User Message|=== System Prompt/);
    assert.doesNotMatch(output, /\[incoming\]/);
  });

  test("context command renders direct turn context before the user prompt", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["--agent", "mechanic", "need to migrate stuff"],
        readWorkspaceConfig(),
      )
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(
      output,
      /\[turn-context\][\s\S]*The turn context above is background for the user message below[\s\S]*need to migrate stuff$/,
    );
    assert.doesNotMatch(output, /immediately before it/);
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
    assert.match(parsed.systemPrompt, /<context path="pi\/available_skills">/);
    assert.match(parsed.systemPrompt, /<available_skills>/);
    assert.match(parsed.systemPrompt, /<name>shrimpy-setup<\/name>/);
    assert.match(parsed.systemPrompt, /<name>shrimpy-channels<\/name>/);
    assert.match(parsed.systemPrompt, /<name>shrimpy-watches<\/name>/);
    assert.match(parsed.systemPrompt, /<name>shrimpy-skills<\/name>/);
    assert.match(parsed.systemPrompt, /<name>shrimpy-workspace-migration<\/name>/);
    assert.match(parsed.systemPrompt, /<name>shrimpy-security-audit<\/name>/);
    assert.match(parsed.systemPrompt, /<name>shrimpy-hygiene-audit<\/name>/);
    assert.match(parsed.systemPrompt, /<name>shrimpy-coding-delegation<\/name>/);
    assert.match(parsed.systemPrompt, /<name>memory-management<\/name>/);
    assert.match(parsed.systemPrompt, /<name>remember<\/name>/);
    assert.doesNotMatch(parsed.systemPrompt, /<name>setup<\/name>/);
    assert.doesNotMatch(parsed.systemPrompt, /<name>mechanic<\/name>/);
    assert.doesNotMatch(parsed.systemPrompt, /<name>codex-web-search<\/name>/);
    assert.match(parsed.systemPrompt, /<context path="pi\/runtime_facts">/);
    assert.match(parsed.systemPrompt, /Current time: .*; UTC: \d{4}-\d{2}-\d{2}T/);
    assert.match(parsed.systemPrompt, new RegExp(`\\(${Intl.DateTimeFormat().resolvedOptions().timeZone}, UTC[+-]\\d{2}:\\d{2}\\)`));
    assert.match(parsed.systemPrompt, /Current working directory:/);
    assert.doesNotMatch(parsed.systemPrompt, /\[end context\]/);
    assert.match(parsed.shrimpySystemPrompt, /# SOUL/);
    assert.doesNotMatch(parsed.shrimpySystemPrompt, /<available_skills>/);
    assert.doesNotMatch(parsed.systemPrompt, /\*\*model_id\*\*/);
    assert.doesNotMatch(parsed.systemPrompt, /\*\*provider\*\*/);
    assert.doesNotMatch(parsed.systemPrompt, /Load a skill when/);
    assert.doesNotMatch(parsed.systemPrompt, /\| Skill \| Scope \| Description \|/);
    assert.match(parsed.turnContext.text, /^\[turn-context\]/);
    assert.equal(parsed.inputMessage, "[channel: home, sender: human:(user)]\nhello");
    assert.match(parsed.userMessage, /^\[turn-context\]/);
    assert.match(
      parsed.userMessage,
      /\[channel: home, sender: human:\(user\)\]\nhello$/,
    );
    assert.equal(parsed.context.systemPrompt, parsed.systemPrompt);
    assert.deepEqual(parsed.context.tools, parsed.activeTools);
    assert.ok(parsed.activeTools.some((tool: any) =>
      tool.name === "send_message" &&
      tool.description &&
      tool.parameters?.type === "object"
    ));
    assert.equal(
      parsed.context.messages[0].content[0].text,
      parsed.userMessage,
    );
    assert.deepEqual(parsed.selectedSkills, []);
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

  test("context turn output includes channel unread context", async () => {
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

  test("context json presents direct turn context before the prompt", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--json", "hello direct"], { workspace } as any)
    );

    assert.equal(result, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.inputMessage, "hello direct");
    assert.equal(parsed.userMessage, "hello direct");
    assert.match(
      parsed.context.messages[0].content[0].text,
      /^\[turn-context\]/,
    );
    assert.match(
      parsed.context.messages[0].content[0].text,
      /The turn context above is background for the user message below/,
    );
    assert.match(
      parsed.context.messages[0].content[0].text,
      /hello direct$/,
    );
    assert.equal(parsed.context.messages.length, 1);
  });

  test("context inspection does not execute or cache automatic producers", async () => {
    await setupInit(workspace);
    const counterPath = join(workspace, "inspection-producer.txt");
    const configPath = join(workspace, "config", "shrimpy.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.context.turn.producers.push({
      id: "inspection.side-effect",
      run: `node -e "require('fs').writeFileSync(${JSON.stringify(counterPath)}, 'ran'); console.log('should not appear')"`,
    });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--channel", "home", "--json", "inspect safely"], {
        ...config,
        workspace,
      } as any)
    );

    assert.equal(result, 0);
    assert.equal(existsSync(counterPath), false);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.turnContext.producers[0].status, "skipped");
    assert.equal(
      parsed.turnContext.producers[0].reason,
      "preview does not execute automatic producers",
    );
    assert.doesNotMatch(
      JSON.stringify(parsed.context),
      /should not appear/,
    );
  });

  test("context can inspect a durable session without changing its transcript", async () => {
    await setupInit(workspace);
    const runtime = createAppRuntime({ workspace });
    const agentRoot = runtime.getAgentPaths("shrimpy").root;
    const descriptor = createSessionDescriptor({
      agentRoot,
      key: createLocalSessionKey({
        agentId: "shrimpy",
        name: "history",
      }),
      purpose: "interactive",
      delivery: { kind: "transcript" },
      cwd: runtime.getAgentCwd("shrimpy"),
    });
    ensureSessionManifest(descriptor);
    assert.equal(descriptor.storage.kind, "durable");
    const manager = SessionManager.create(
      runtime.getAgentCwd("shrimpy"),
      descriptor.storage.dir,
    );
    manager.appendModelChange("history-provider", "history-model");
    manager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "remembered history" }],
      timestamp: Date.now() - 1000,
    });
    manager.appendCustomMessageEntry(
      "shrimpy_turn_context",
      "[turn-context]\nold context\n\nThe turn context above is background for the user message immediately before it.",
      true,
      { text: "[turn-context]\nold context" },
    );
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "remembered answer" }],
      api: "openai-completions",
      provider: "history-provider",
      model: "history-model",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      stopReason: "stop",
      timestamp: Date.now() - 500,
    });
    const sessionFile = manager.getSessionFile();
    assert.ok(sessionFile);
    const before = readFileSync(sessionFile, "utf-8");

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["--session", "local/history", "--json", "next question"],
        { workspace } as any,
      )
    );

    assert.equal(result, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.target.sessionId, "local/history");
    assert.equal(parsed.historyMessageCount, 2);
    assert.match(
      parsed.context.messages[0].content[0].text,
      /^\[turn-context\][\s\S]*old context[\s\S]*remembered history$/,
    );
    assert.match(
      parsed.context.messages[2].content[0].text,
      /^\[turn-context\][\s\S]*next question$/,
    );
    assert.equal(readFileSync(sessionFile, "utf-8"), before);
  });

  test("context sources list exposes only stable configured sources", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["sources", "list", "--json"], { workspace } as any)
    );

    assert.equal(result, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.ok(parsed.some((source: any) =>
      source.id === "directory:workspace:context/" &&
      source.type === "directory" &&
      source.scope === "session"
    ));
    assert.ok(parsed.some((source: any) =>
      source.id === "directory:agent:context/" &&
      source.type === "directory" &&
      source.scope === "session"
    ));
    assert.equal(parsed.some((source: any) => source.scope === "turn"), false);
  });

  test("context sources run renders file and directory sources through prompt sections", async () => {
    await setupInit(workspace);

    const workspaceDirRun = await captureLogs(() =>
      cmdContext(
        ["sources", "run", "directory:workspace:context/"],
        { workspace } as any,
      )
    );
    const dirRun = await captureLogs(() =>
      cmdContext(
        ["sources", "run", "directory:agent:context/"],
        { workspace } as any,
      )
    );

    const workspaceDirOutput = workspaceDirRun.lines.join("\n");
    const dirOutput = dirRun.lines.join("\n");
    assert.equal(workspaceDirRun.result, 0);
    assert.equal(dirRun.result, 0);
    assert.ok(workspaceDirOutput.startsWith(
      `<context path="${join(workspace, "context", "SYSTEM.md")}">`,
    ));
    assert.ok(workspaceDirOutput.includes(
      `<context path="${join(workspace, "context", "USER.md")}">`,
    ));
    assert.ok(workspaceDirOutput.includes(
      `<context path="${join(workspace, "context", "WORKSPACE.md")}">`,
    ));
    assert.equal(dirOutput.trim(), "");
    assert.equal(dirOutput.includes(
      `<context path="${join(workspace, "agents", "shrimpy", "context", "identity.md")}">`,
    ), false);
    assert.doesNotMatch(workspaceDirOutput, /^## context\/SYSTEM\.md/m);
    assert.doesNotMatch(dirOutput, /^## context\//m);
  });

  test("context producers list inspects matching without executing", async () => {
    await setupInit(workspace);
    const configPath = join(workspace, "config", "shrimpy.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.context.turn.producers.push({
      id: "test.command",
      run: "node -e \"console.log([process.env.SHRIMPY_CONTEXT_AGENT, process.env.SHRIMPY_CONTEXT_CHANNEL, process.env.SHRIMPY_CONTEXT_SESSION_TYPE].join(':'))\"",
      when: { channels: ["home"] },
      maxChars: 100,
    });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    const listed = await captureLogs(() =>
      cmdContext(
        ["producers", "list", "--channel", "home", "--json"],
        { ...config, workspace } as any,
      )
    );
    assert.equal(listed.result, 0);
    const producer = JSON.parse(listed.lines.join("\n"))
      .find((candidate: any) => candidate.id === "test.command");
    assert.equal(producer.matched, true);
    assert.equal(producer.status, "matched");

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["producers", "run", "test.command", "--channel", "home", "--session-type", "watch"],
        { ...config, workspace } as any,
      )
    );

    assert.equal(result, 0);
    assert.equal(lines.join("\n"), "shrimpy:home:watch");
  });

  test("context producers run exposes parsed producer items as json", async () => {
    await setupInit(workspace);
    const configPath = join(workspace, "config", "shrimpy.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.context.turn.producers.push({
      id: "json.command",
      run: "node -e \"console.log(JSON.stringify({summary:'parsed item',inspect:'shrimpy context producers run json.command'}))\"",
      maxChars: 200,
    });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["producers", "run", "json.command", "--json"],
        { ...config, workspace } as any,
      )
    );

    assert.equal(result, 0);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.id, "json.command");
    assert.equal(parsed.status, "ran");
    assert.equal(parsed.output, "{\"summary\":\"parsed item\",\"inspect\":\"shrimpy context producers run json.command\"}");
    assert.deepEqual(parsed.items, [{
      id: "producer:json.command:0",
      summary: "parsed item",
      inspect: "shrimpy context producers run json.command",
    }]);
  });

  test("context producers run reports failures as inspectable json", async () => {
    await setupInit(workspace);
    const configPath = join(workspace, "config", "shrimpy.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.context.turn.producers.push({
      id: "broken.command",
      run: "node -e \"throw new Error('broken producer')\"",
      maxChars: 200,
    });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["producers", "run", "broken.command", "--json"],
        { ...config, workspace } as any,
      )
    );

    assert.equal(result, 1);
    const parsed = JSON.parse(lines.join("\n"));
    assert.equal(parsed.id, "broken.command");
    assert.equal(parsed.status, "failed");
    assert.equal(parsed.output, "");
    assert.match(parsed.error, /broken producer/);
    assert.equal(parsed.items[0].id, "producer:broken.command:error");
    assert.match(parsed.items[0].summary, /broken.command: context producer failed/);
    assert.equal(parsed.items[0].inspect, "node -e \"throw new Error('broken producer')\"");
  });

  test("context producers run runtime producer honors session type", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["producers", "run", "runtime:turn-context", "--channel", "home", "--session-type", "watch"],
        { workspace } as any,
      )
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /session: watch channel: home/);
  });

  test("context command renders section manifest for turn context output", async () => {
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
    assert.match(output, /<available_skills>/);
    assert.match(output, /\[turn-context\][\s\S]*\[channel: home, sender: human:\(user\)\]\nhello/);
    assert.doesNotMatch(output, /=== Turn Context|=== User Message|=== System Prompt/);
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
    assert.match(lines.join("\n"), /shrimpy-setup \[agent package\]/);
    assert.match(lines.join("\n"), /shrimpy-agents \[workspace package\]/);
    assert.match(lines.join("\n"), /shrimpy-channels \[workspace package\]/);
    assert.match(lines.join("\n"), /shrimpy-hygiene-audit \[agent package\]/);
    assert.match(lines.join("\n"), /shrimpy-watches \[agent package\]/);
    assert.match(lines.join("\n"), /shrimpy-watches-default-init \[agent package\]/);
    assert.match(lines.join("\n"), /shrimpy-skills \[workspace package\]/);
    assert.match(lines.join("\n"), /shrimpy-security-audit \[agent package\]/);
    assert.match(lines.join("\n"), /shrimpy-workspace-migration \[agent package\]/);
    assert.match(lines.join("\n"), /shrimpy-search \[workspace package\]/);
    assert.match(lines.join("\n"), /Create, inspect, configure, rename, remove, or debug Shrimpy agents/);
    assert.match(lines.join("\n"), /memory-management \[workspace package\]/);
    assert.match(lines.join("\n"), /shrimpy-coding-delegation \[workspace package\]/);
    assert.match(lines.join("\n"), /remember \[workspace package\]/);
    assert.match(lines.join("\n"), /Save links, files, notes, collections/);
    assert.match(lines.join("\n"), /Periodic upkeep of my own context\/ directory/);
    assert.match(lines.join("\n"), /journal-daily \[workspace package\]/);
    assert.match(lines.join("\n"), /journal-compact \[workspace package\]/);
    assert.match(lines.join("\n"), /source: included:shrimpy-setup/);
    assert.match(lines.join("\n"), /assignment: agent mechanic/);
    assert.match(lines.join("\n"), /modified: no/);
    assert.doesNotMatch(lines.join("\n"), /codex-web-search/);
    assert.doesNotMatch(lines.join("\n"), /mechanic \[/);
    assert.doesNotMatch(lines.join("\n"), /activity-summary/);
  });

  test("mechanic-only skills are not visible to the default shrimpy agent", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdSkills(["list", "--agent", "shrimpy"], readWorkspaceConfig())
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /memory-management \[workspace package\]/);
    assert.match(output, /shrimpy-agents \[workspace package\]/);
    assert.match(output, /shrimpy-coding-delegation \[workspace package\]/);
    assert.match(output, /remember \[workspace package\]/);
    assert.match(output, /shrimpy-search \[workspace package\]/);
    assert.match(output, /shrimpy-channels \[workspace package\]/);
    assert.doesNotMatch(output, /shrimpy-watches/);
    assert.doesNotMatch(output, /shrimpy-watches-default-init/);
    assert.match(output, /shrimpy-skills \[workspace package\]/);
    assert.match(output, /journal-daily \[workspace package\]/);
    assert.match(output, /journal-compact \[workspace package\]/);
    assert.doesNotMatch(output, /codex-web-search/);
    assert.doesNotMatch(output, /mechanic \[agent\]/);
    assert.doesNotMatch(output, /shrimpy-hygiene-audit/);
    assert.doesNotMatch(output, /shrimpy-security-audit/);
    assert.doesNotMatch(output, /shrimpy-workspace-migration/);
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
    writeFileSync(join(source, "scripts", "helper.sh"), "echo helper\n", "utf-8");
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
        () => cmdSkills(["add", invalidSource, "--agent", "shrimpy"], { workspace } as any),
        /missing SKILL\.md/,
      );
      assert.equal(existsSync(join(workspace, "agents", "shrimpy", "skills", "invalid-source")), false);
      await assert.rejects(
        () => cmdSkills(["add", source, "--id", "source-skill", "--agent", "shrimpy"], { workspace } as any),
        /Unknown option '--id'/,
      );

      const install = await captureLogs(() =>
        cmdSkills(
          ["add", source, "--agent", "shrimpy"],
          { workspace } as any,
        )
      );
      assert.equal(install.result, 0);
      const installedPath = join(workspace, "agents", "shrimpy", "skills", "source-skill", "SKILL.md");
      assert.equal(existsSync(installedPath), true);
      assert.equal(
        readFileSync(join(workspace, "agents", "shrimpy", "skills", "source-skill", "scripts", "helper.sh"), "utf-8"),
        "echo helper\n",
      );
      const packages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(packages.packages["agent:shrimpy:source-skill"].installKey, "agent:shrimpy:source-skill");
      assert.equal(packages.packages["agent:shrimpy:source-skill"].source, source);
      assert.equal(packages.packages["agent:shrimpy:source-skill"].scope, "agent");
      assert.equal(packages.packages["agent:shrimpy:source-skill"].agentId, "shrimpy");
      assert.equal(packages.packages["agent:shrimpy:source-skill"].installedPath, join(workspace, "agents", "shrimpy", "skills", "source-skill"));
      assert.equal(packages.packages["agent:shrimpy:source-skill"].modified, false);

      await assert.rejects(
        () => cmdSkills(["add", source, "--agent", "shrimpy"], { workspace } as any),
        /skill package already exists/,
      );

      const workspaceInstall = await captureLogs(() =>
        cmdSkills(["add", source, "--workspace"], { workspace } as any)
      );
      assert.equal(workspaceInstall.result, 0);
      assert.equal(existsSync(join(workspace, "skills", "source-skill", "SKILL.md")), true);
      const multiTargetPackages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(multiTargetPackages.packages["workspace:source-skill"].installKey, "workspace:source-skill");
      assert.equal(multiTargetPackages.packages["workspace:source-skill"].scope, "workspace");
      assert.equal(multiTargetPackages.packages["agent:shrimpy:source-skill"].scope, "agent");
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(invalidSource, { recursive: true, force: true });
    }
  });

  test("codex web search wrapper hides Codex exec flag order", () => {
    const root = mkdtempSync(join(tmpdir(), "shrimpy-codex-web-search-wrapper-"));
    const binDir = join(root, "bin");
    const argvPath = join(root, "argv.txt");
    mkdirSync(binDir, { recursive: true });
    const fakeCodexPath = join(binDir, "codex");
    writeFileSync(
      fakeCodexPath,
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `argv_path=${JSON.stringify(argvPath)}`,
        "printf '%s\\0' \"$@\" > \"$argv_path\"",
        "out=''",
        "while (($#)); do",
        "  if [[ \"$1\" == '--output-last-message' ]]; then",
        "    shift",
        "    out=\"$1\"",
        "  fi",
        "  shift || true",
        "done",
        "printf '%s\\n' '{\"type\":\"turn.completed\"}'",
        "printf '%s\\n' 'wrapped answer' > \"$out\"",
      ].join("\n"),
      "utf-8",
    );
    chmodSync(fakeCodexPath, 0o755);

    try {
      const scriptPath = join(
        projectRoot,
        "src",
        "skills",
        "included",
        "codex-web-search",
        "scripts",
        "codex-web-search",
      );
      const result = spawnSync("bash", [scriptPath, "what is silver doing today?"], {
        encoding: "utf-8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "wrapped answer\n");
      assert.match(result.stderr, /codex-web-search jsonl:/);
      const args = readFileSync(argvPath).toString("utf-8").split("\0").filter(Boolean);
      assert.deepEqual(args.slice(0, 4), ["--search", "--ask-for-approval", "never", "exec"]);
      assert.ok(args.includes("--skip-git-repo-check"));
      assert.ok(args.includes("--ephemeral"));
      assert.deepEqual(args.slice(args.indexOf("-C"), args.indexOf("-C") + 2), ["-C", "/tmp"]);
      assert.deepEqual(args.slice(args.indexOf("--sandbox"), args.indexOf("--sandbox") + 2), ["--sandbox", "read-only"]);
      assert.match(args.at(-1) ?? "", /Question:\nwhat is silver doing today\?/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("skills command treats allowed-tools command filters as bash requirements", async () => {
    await setupInit(workspace);
    const source = mkdtempSync(join(tmpdir(), "shrimpy-agent-browser-source-"));
    writeFileSync(
      join(source, "SKILL.md"),
      [
        "---",
        "name: agent-browser",
        "description: Drive browser automation through a bash command.",
        "allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)",
        "---",
        "",
        "# Agent Browser",
        "",
      ].join("\n"),
      "utf-8",
    );

    try {
      const install = await captureLogs(() =>
        cmdSkills(["add", source, "--workspace"], { workspace } as any)
      );
      assert.equal(install.result, 0);

      const runtime = createAppRuntime(readWorkspaceConfig());
      const skill = getSkillView(runtime, "agent-browser", "mechanic");
      assert.equal(skill.available, true);
      assert.deepEqual(skill.requiredTools, ["bash"]);
      assert.deepEqual(skill.missingTools, []);

      const validate = await captureLogs(() =>
        cmdSkills(["validate", "agent-browser", "--agent", "mechanic", "--json"], readWorkspaceConfig())
      );
      assert.equal(validate.result, 0);
      const validation = JSON.parse(validate.lines.join("\n"));
      assert.deepEqual(validation.issues, []);
      assert.deepEqual(validation.packages.map((entry: any) => ({
        id: entry.id,
        sourceKind: entry.sourceKind,
        assignment: entry.assignment,
        modified: entry.modified,
      })), [{
        id: "agent-browser",
        sourceKind: "local-directory",
        assignment: "workspace",
        modified: false,
      }]);

      const list = await captureLogs(() =>
        cmdSkills(["list", "--agent", "mechanic", "--json"], readWorkspaceConfig())
      );
      assert.equal(list.result, 0);
      const inventory = JSON.parse(list.lines.join("\n"));
      const listed = inventory.skills.find((item: any) => item.id === "agent-browser");
      assert.ok(listed);
      assert.equal(listed.available, true);
      assert.deepEqual(listed.requiredTools, ["bash"]);
      assert.deepEqual(listed.missingTools, []);

      const configPath = join(workspace, "config", "shrimpy.json");
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      config.agents = config.agents.map((agent: any) =>
        agent.id === "mechanic"
          ? { ...agent, disabledTools: [...(agent.disabledTools ?? []), "bash"] }
          : agent
      );
      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

      const disabledList = await captureLogs(() =>
        cmdSkills(["list", "--agent", "mechanic", "--json"], readWorkspaceConfig())
      );
      assert.equal(disabledList.result, 0);
      const disabledInventory = JSON.parse(disabledList.lines.join("\n"));
      const disabledListed = disabledInventory.skills.find((item: any) => item.id === "agent-browser");
      assert.ok(disabledListed);
      assert.equal(disabledListed.available, false);
      assert.deepEqual(disabledListed.requiredTools, ["bash"]);
      assert.deepEqual(disabledListed.missingTools, ["bash"]);
      assert.deepEqual(disabledListed.blockedReasons, ["missing required tools: bash"]);
    } finally {
      rmSync(source, { recursive: true, force: true });
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
      const dryRunPackages = JSON.parse(
        readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"),
      ).packages;
      assert.equal(dryRunPackages["agent:shrimpy:alpha"], undefined);
      assert.equal(dryRunPackages["agent:shrimpy:beta"], undefined);

      const dryRunAll = await captureLogs(() =>
        cmdSkills(["add", "octo/skills", "--dry-run", "--all", "--json"], { workspace } as any)
      );
      assert.equal(dryRunAll.result, 0);
      const dryRunAllJson = JSON.parse(dryRunAll.lines.join("\n"));
      assert.deepEqual(
        dryRunAllJson.selectedCandidates.map((candidate: any) => candidate.id),
        ["alpha", "beta"],
      );
      const dryRunAllPackages = JSON.parse(
        readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"),
      ).packages;
      assert.equal(dryRunAllPackages["agent:shrimpy:alpha"], undefined);
      assert.equal(dryRunAllPackages["agent:shrimpy:beta"], undefined);

      const install = await captureLogs(() =>
        cmdSkills(["add", "octo/skills", "--path", "skills/alpha", "--agent", "shrimpy"], { workspace } as any)
      );
      assert.equal(install.result, 0);
      const installedPath = join(workspace, "agents", "shrimpy", "skills", "alpha", "SKILL.md");
      assert.equal(existsSync(installedPath), true);
      assert.match(readFileSync(installedPath, "utf-8"), /# Alpha/);
      assert.deepEqual(
        readFileSync(join(workspace, "agents", "shrimpy", "skills", "alpha", "assets", "pixel.bin")),
        Buffer.from([0, 255, 1, 2]),
      );
      const packages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(packages.packages["agent:shrimpy:alpha"].installKey, "agent:shrimpy:alpha");
      assert.equal(packages.packages["agent:shrimpy:alpha"].sourceKind, "github");
      assert.equal(packages.packages["agent:shrimpy:alpha"].scope, "agent");
      assert.equal(packages.packages["agent:shrimpy:alpha"].agentId, "shrimpy");
      assert.equal(packages.packages["agent:shrimpy:alpha"].installedPath, join(workspace, "agents", "shrimpy", "skills", "alpha"));
      assert.equal(packages.packages["agent:shrimpy:alpha"].modified, false);
      assert.equal(packages.packages["agent:shrimpy:alpha"].sourceRevision, "tree-alpha-v1");
      assert.equal(packages.packages["agent:shrimpy:alpha"].github.owner, "octo");
      assert.equal(packages.packages["agent:shrimpy:alpha"].github.repo, "skills");
      assert.equal(packages.packages["agent:shrimpy:alpha"].github.path, "skills/alpha");
      const shrimpyRuntime = createAppRuntime(readWorkspaceConfig());
      const alphaSkill = getSkillView(shrimpyRuntime, "alpha", "shrimpy");
      assert.equal(alphaSkill.scope, "agent");
      assert.equal(alphaSkill.sourceKind, "package");
      assert.equal(alphaSkill.packageInfo?.sourceKind, "github");
      assert.throws(() => getSkillView(shrimpyRuntime, "alpha", "mechanic"), /skill not found/);

      const installWorkspace = await captureLogs(() =>
        cmdSkills(["add", "octo/skills", "--path", "skills/alpha", "--workspace"], { workspace } as any)
      );
      assert.equal(installWorkspace.result, 0);
      const workspaceInstalledPath = join(workspace, "skills", "alpha", "SKILL.md");
      assert.equal(existsSync(workspaceInstalledPath), true);
      const multiInstallPackages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(multiInstallPackages.packages["workspace:alpha"].installKey, "workspace:alpha");
      assert.equal(multiInstallPackages.packages["workspace:alpha"].sourceRevision, "tree-alpha-v1");
      const mechanicRuntime = createAppRuntime(readWorkspaceConfig());
      assert.equal(getSkillView(mechanicRuntime, "alpha", "mechanic").scope, "workspace");

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
      await assert.rejects(
        () => cmdSkills(["update", "alpha", "--dry-run"], { workspace } as any),
        /multiple skill package installs found/,
      );

      const updateDryRun = await captureLogs(() =>
        cmdSkills(["update", "alpha", "--agent", "shrimpy", "--dry-run", "--json"], { workspace } as any)
      );
      assert.equal(updateDryRun.result, 0);
      const updateDryRunJson = JSON.parse(updateDryRun.lines.join("\n"));
      assert.equal(updateDryRunJson.updateAvailable, true);
      assert.equal(updateDryRunJson.current.sourceRevision, "tree-alpha-v1");
      assert.equal(updateDryRunJson.latest.sourceRevision, "tree-alpha-v2");
      assert.match(readFileSync(installedPath, "utf-8"), /# Alpha/);
      assert.doesNotMatch(readFileSync(installedPath, "utf-8"), /# Alpha V2/);

      const update = await captureLogs(() =>
        cmdSkills(["update", "alpha", "--agent", "shrimpy"], { workspace } as any)
      );
      assert.equal(update.result, 0);
      assert.match(update.lines.join("\n"), /Updated skill package alpha/);
      assert.match(readFileSync(installedPath, "utf-8"), /# Alpha V2/);
      const updatedPackages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(updatedPackages.packages["agent:shrimpy:alpha"].sourceRevision, "tree-alpha-v2");
      assert.equal(updatedPackages.packages["agent:shrimpy:alpha"].installedPath, join(workspace, "agents", "shrimpy", "skills", "alpha"));
      assert.equal(updatedPackages.packages["agent:shrimpy:alpha"].modified, false);
      assert.equal(updatedPackages.packages["workspace:alpha"].sourceRevision, "tree-alpha-v1");

      await assert.rejects(
        () => cmdSkills(["remove", "alpha"], { workspace } as any),
        /multiple skill package installs found/,
      );
      const removeAgent = await captureLogs(() =>
        cmdSkills(["remove", "alpha", "--agent", "shrimpy"], { workspace } as any)
      );
      assert.equal(removeAgent.result, 0);
      assert.match(removeAgent.lines.join("\n"), /Removed agent shrimpy skill package alpha/);
      assert.equal(existsSync(join(workspace, "agents", "shrimpy", "skills", "alpha")), false);
      const afterAgentRemovePackages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(afterAgentRemovePackages.packages["agent:shrimpy:alpha"], undefined);
      assert.ok(afterAgentRemovePackages.packages["workspace:alpha"]);
      assert.equal(getSkillView(createAppRuntime(readWorkspaceConfig()), "alpha", "shrimpy").scope, "workspace");

      const removeWorkspace = await captureLogs(() =>
        cmdSkills(["remove", "alpha", "--workspace", "--json"], { workspace } as any)
      );
      assert.equal(removeWorkspace.result, 0);
      const removeWorkspaceJson = JSON.parse(removeWorkspace.lines.join("\n"));
      assert.equal(removeWorkspaceJson.scope, "workspace");
      assert.equal(existsSync(join(workspace, "skills", "alpha")), false);
      const afterWorkspaceRemovePackages = JSON.parse(readFileSync(join(workspace, "state", "skills", "packages.json"), "utf-8"));
      assert.equal(afterWorkspaceRemovePackages.packages["workspace:alpha"], undefined);
      assert.throws(() => getSkillView(createAppRuntime(readWorkspaceConfig()), "alpha", "shrimpy"), /skill not found/);
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
      "journal-compact:workspace",
      "journal-daily:workspace",
      "memory-management:workspace",
      "remember:workspace",
      "shrimpy-agents:workspace",
      "shrimpy-channels:workspace",
      "shrimpy-coding-delegation:workspace",
      "shrimpy-hygiene-audit:agent",
      "shrimpy-search:workspace",
      "shrimpy-security-audit:agent",
      "shrimpy-setup:agent",
      "shrimpy-skills:workspace",
      "shrimpy-watches:agent",
      "shrimpy-watches-default-init:agent",
      "shrimpy-workspace-migration:agent",
    ]);

    const shrimpySkills = listSkillViews(runtime, "shrimpy");
    assert.deepEqual(shrimpySkills.map((skill) => `${skill.id}:${skill.scope}`), [
      "journal-compact:workspace",
      "journal-daily:workspace",
      "memory-management:workspace",
      "remember:workspace",
      "shrimpy-agents:workspace",
      "shrimpy-channels:workspace",
      "shrimpy-coding-delegation:workspace",
      "shrimpy-search:workspace",
      "shrimpy-skills:workspace",
    ]);

    const mechanicRoot = join(workspace, "agents", "mechanic");
    const skill = getSkillView(runtime, "shrimpy-setup", "mechanic");
    assert.equal(skill.entryPath, join(mechanicRoot, "skills", "shrimpy-setup", "SKILL.md"));
    assert.equal(skill.loaded, true);
    assert.equal(skill.sourceKind, "package");
    assert.equal(skill.packageInfo?.sourceKind, "included");
    assert.equal(skill.packageInfo?.modified, false);
    assert.match(loadSkillPrompt(runtime, "shrimpy-setup", "mechanic"), /first usable Shrimpy workspace/);
    const securityAudit = getSkillView(runtime, "shrimpy-security-audit", "mechanic");
    assert.equal(securityAudit.loaded, true);
    assert.match(loadSkillPrompt(runtime, "shrimpy-security-audit", "mechanic"), /agents\/mechanic\/vault\/audits/);
    const hygieneAudit = getSkillView(runtime, "shrimpy-hygiene-audit", "mechanic");
    assert.equal(hygieneAudit.loaded, true);
    assert.match(loadSkillPrompt(runtime, "shrimpy-hygiene-audit", "mechanic"), /checked, found nothing/);
    const codingDelegation = getSkillView(runtime, "shrimpy-coding-delegation", "shrimpy");
    assert.equal(codingDelegation.available, true);
    assert.equal(codingDelegation.sourceKind, "package");
    assert.deepEqual(codingDelegation.requiredTools, ["bash"]);
    const remember = getSkillView(runtime, "remember", "shrimpy");
    assert.equal(remember.available, true);
    assert.match(loadSkillPrompt(runtime, "remember", "shrimpy"), /owning agent's `vault\/`/);
    assert.match(loadSkillPrompt(runtime, "remember", "shrimpy"), /Do not create a packet when a single saved note is enough/);
    assert.deepEqual(getSkillPromptResources(runtime, "shrimpy-setup", "mechanic"), [{
      rootPath: mechanicRoot,
      resourcePath: "skills/shrimpy-setup",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "shrimpy-agents", "mechanic"), [{
      rootPath: workspace,
      resourcePath: "skills/shrimpy-agents",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "shrimpy-security-audit", "mechanic"), [{
      rootPath: mechanicRoot,
      resourcePath: "skills/shrimpy-security-audit",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "shrimpy-hygiene-audit", "mechanic"), [{
      rootPath: mechanicRoot,
      resourcePath: "skills/shrimpy-hygiene-audit",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "memory-management"), [{
      rootPath: workspace,
      resourcePath: "skills/memory-management",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "shrimpy-coding-delegation"), [{
      rootPath: workspace,
      resourcePath: "skills/shrimpy-coding-delegation",
    }]);
    assert.deepEqual(getSkillPromptResources(runtime, "remember"), [{
      rootPath: workspace,
      resourcePath: "skills/remember",
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
      "journal-compact",
      "journal-daily",
      "memory-management",
      "remember",
      "shrimpy-agents",
      "shrimpy-channels",
      "shrimpy-coding-delegation",
      "shrimpy-hygiene-audit",
      "shrimpy-search",
      "shrimpy-security-audit",
      "shrimpy-setup",
      "shrimpy-skills",
      "shrimpy-watches",
      "shrimpy-watches-default-init",
      "shrimpy-workspace-migration",
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
