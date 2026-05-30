import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cmdContext } from "../dist/commands/context.js";
import { cmdSkills } from "../dist/commands/skills.js";
import { setupInit } from "../dist/setup.js";
import {
  createAppRuntime,
} from "../dist/app/index.js";
import {
  textContent,
} from "../dist/channels/index.js";
import {
  getSkillPromptResources,
  getSkillView,
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

async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const result = await fn();
    return { result, lines };
  } finally {
    console.log = originalLog;
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

  test("context command renders the composed user message preview", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--channel", "home", "hello"], { workspace } as any)
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /## Delivery/);
    assert.match(output, /send_message\(channel="home", text="\.\.\."\)/);
    assert.match(output, /<context>\n\[briefing\]/);
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
    assert.ok(parsed.promptSections.some((section: any) => section.id === "capability:available_skills"));
    assert.ok(parsed.promptSections.some((section: any) =>
      section.id === "session:runtime_environment" && section.kind === "runtime"
    ));
    assert.deepEqual(
      [...new Set(parsed.promptSections.map((section: any) => section.kind))].sort(),
      ["capability", "identity", "memory", "runtime"],
    );
    assert.equal(parsed.contextLayers, undefined);
    assert.equal(parsed.briefing.sessionType, "gateway");
    assert.match(parsed.systemPrompt, /- `setup` \(agent\):/);
    assert.doesNotMatch(parsed.systemPrompt, /Load a skill when/);
    assert.doesNotMatch(parsed.systemPrompt, /\| Skill \| Scope \| Description \|/);
    assert.match(parsed.turnPrompt, /<context>\n\[briefing\]/);
    assert.match(parsed.turnPrompt, /\[channel: home, sender: human:\(user\)\]\nhello/);
    assert.doesNotMatch(parsed.turnPrompt, /\[incoming\]/);
  });

  test("context command can render only the briefing preview", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["--channel", "home", "--briefing"], { workspace } as any)
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /^\[briefing\]/);
    assert.match(output, /session: gateway channel: home/);
    assert.doesNotMatch(output, /## Prompt Sections/);
    assert.doesNotMatch(output, /=== System Prompt ===/);
  });

  test("context turn preview includes channel unread briefing", async () => {
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
    assert.match(parsed.briefing.text, /home: 2 new messages/);
    assert.match(parsed.turnPrompt, /inspect: shrimpy channels read home/);
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

  test("context sources run executes command sources", async () => {
    await setupInit(workspace);
    const configPath = join(workspace, "config", "shrimpy.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    config.context.sources.push({
      type: "command",
      id: "test.command",
      command: "node -e \"console.log(process.env.SHRIMPY_BRIEFING_CHANNEL + ':ok')\"",
      channels: ["home"],
      maxChars: 100,
    });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

    const { result, lines } = await captureLogs(() =>
      cmdContext(
        ["sources", "run", "test.command", "--channel", "home"],
        { ...config, workspace } as any,
      )
    );

    assert.equal(result, 0);
    assert.equal(lines.join("\n"), "home:ok");
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
    assert.match(output, /\[capability\]/);
    assert.match(output, /\[runtime\]/);
    assert.match(output, /\[briefing\]/);
    assert.match(output, /=== System Prompt ===/);
    assert.match(output, /=== User Message ===/);
  });

  test("context turn subcommand renders a full turn preview without a prompt", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdContext(["turn", "--channel", "home"], { workspace } as any)
    );

    const output = lines.join("\n");
    assert.equal(result, 0);
    assert.match(output, /## Prompt Sections/);
    assert.match(output, /\[briefing\]/);
    assert.match(output, /=== System Prompt ===/);
    assert.doesNotMatch(output, /=== User Message ===/);
  });

  test("skills command lists agent and workspace skills", async () => {
    await setupInit(workspace);

    const { result, lines } = await captureLogs(() =>
      cmdSkills(["list"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.match(lines.join("\n"), /setup \[agent\]/);
    assert.match(lines.join("\n"), /memory-management \[workspace\]/);
    assert.match(lines.join("\n"), /journal-daily \[workspace\]/);
    assert.match(lines.join("\n"), /journal-compact \[workspace\]/);
    assert.doesNotMatch(lines.join("\n"), /activity-summary/);
  });
});

describe("skill service", () => {
  test("discovers and loads skills from agent and workspace scopes", async () => {
    await setupInit(workspace);
    const runtime = createAppRuntime({ workspace });

    const skills = listSkillViews(runtime);
    assert.deepEqual(skills.map((skill) => `${skill.id}:${skill.scope}`), [
      "journal-compact:workspace",
      "journal-daily:workspace",
      "memory-management:workspace",
      "setup:agent",
    ]);

    const skill = getSkillView(runtime, "setup");
    assert.match(skill.entryPath, /agents\/shrimpy\/skills\/setup\/SKILL\.md$/);
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
});
