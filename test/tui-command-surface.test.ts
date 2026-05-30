import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getMarkdownTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { createAppRuntime } from "../dist/app/runtime.js";
import { installShrimpyCommandSurface } from "../dist/tui/shrimpy-command-surface.js";

test("Shrimpy command surface appends status output to the TUI log", async () => {
  initTheme("dark", false);
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-command-surface-test-"));
  mkdirSync(join(workspace, "channels"), { recursive: true });
  mkdirSync(join(workspace, "skills", "workspace-skill"), { recursive: true });
  mkdirSync(join(workspace, "agents", "admin", "skills", "agent-skill"), { recursive: true });
  writeFileSync(join(workspace, "channels", "home.jsonl"), "{}\n{}\n");
  writeFileSync(join(workspace, "skills", "workspace-skill", "SKILL.md"), "# Workspace Skill\n");
  writeFileSync(join(workspace, "agents", "admin", "skills", "agent-skill", "SKILL.md"), "# Agent Skill\n");

  const runtime = createAppRuntime({
    workspace,
    agents: [{
      id: "admin",
      root: "agents/admin",
      tools: ["send_message"],
      thinking: "high",
    }],
  } as any);
  const { mode, submissions, statuses, editorTexts, renderChat } = createModeHarness();

  installShrimpyCommandSurface(mode as never, {
    runtime,
    agentId: "admin",
    channel: "home",
    sessionType: "interactive",
    cwd: workspace,
  });
  mode.setupEditorSubmitHandler();

  await mode.defaultEditor.onSubmit!("/status agents");
  await mode.defaultEditor.onSubmit!("/status channels");
  await mode.defaultEditor.onSubmit!("/status skills");
  await mode.defaultEditor.onSubmit!("/shrimpy");
  await mode.defaultEditor.onSubmit!("/share");
  await mode.defaultEditor.onSubmit!("/hello");

  const chat = stripAnsi(renderChat());
  assert.match(chat, /Agents/);
  assert.match(chat, /\* admin root=agents\/admin tools=send_message thinking=high/);
  assert.match(chat, /home 2 msgs/);
  assert.match(chat, /workspace-skill \[workspace\]/);
  assert.match(chat, /agent-skill \[agent\]/);
  assert.match(chat, /\/status \[section\]/);
  assert.deepEqual(statuses, ["Share is hidden in Shrimpy for now"]);
  assert.deepEqual(editorTexts, ["", "", "", "", ""]);
  assert.deepEqual(submissions, ["/hello"]);
});

test("Shrimpy command surface replaces Pi changelog command output", async () => {
  initTheme("dark", false);
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-command-surface-test-"));
  const runtime = createAppRuntime({ workspace } as any);
  const { mode, renderChat } = createModeHarness();

  installShrimpyCommandSurface(mode as never, {
    runtime,
    agentId: "shrimpy",
    channel: "home",
    sessionType: "interactive",
    cwd: workspace,
  });
  mode.setupEditorSubmitHandler();

  await mode.defaultEditor.onSubmit!("/changelog");

  const chat = stripAnsi(renderChat());
  assert.match(chat, /What's New in Shrimpy/);
  assert.match(chat, /Shrimpy Changelog/);
});

function createModeHarness() {
  const submissions: string[] = [];
  const statuses: string[] = [];
  const editorTexts: string[] = [];
  const children: Array<{ render(width: number): string[] }> = [];
  const mode = {
    defaultEditor: {} as { onSubmit?: (text: string) => void | Promise<void> },
    editor: {
      setText(text: string): void {
        editorTexts.push(text);
      },
    },
    chatContainer: {
      addChild(component: { render(width: number): string[] }): void {
        children.push(component);
      },
    },
    ui: {
      requestRender(): void {},
    },
    session: {
      model: { provider: "openai", id: "gpt-test" },
    },
    setupEditorSubmitHandler(): void {
      mode.defaultEditor.onSubmit = async (text: string) => {
        if (text.trim() === "/changelog") {
          mode.handleChangelogCommand();
          mode.editor.setText("");
          return;
        }
        submissions.push(text);
      };
    },
    handleChangelogCommand(): void {
      submissions.push("/pi-changelog");
    },
    showStatus(message: string): void {
      statuses.push(message);
    },
    getMarkdownThemeWithSettings() {
      return getMarkdownTheme();
    },
  };

  return {
    mode,
    submissions,
    statuses,
    editorTexts,
    renderChat(): string {
      return children.flatMap((component) => component.render(100)).join("\n");
    },
  };
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, "");
}
