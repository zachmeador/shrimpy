import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getMarkdownTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { createAppRuntime } from "../dist/app/runtime.js";
import { installShrimpyInlineCommands } from "../dist/tui/inline-commands.js";

test("Shrimpy keeps status and help output inline and blocks hidden sharing", async () => {
  initTheme("dark", false);
  const workspace = createWorkspace();
  const runtime = createAppRuntime({
    workspace,
    agents: [{ id: "admin", root: "agents/admin", tools: ["send_message"] }],
  } as never);
  const harness = createModeHarness();

  installShrimpyInlineCommands(harness.mode as never, {
    runtime,
    agentId: "admin",
    sessionId: "local/main",
    purpose: "interactive",
    cwd: workspace,
  });
  harness.mode.setupEditorSubmitHandler();

  await harness.mode.defaultEditor.onSubmit!("/status agents");
  await harness.mode.defaultEditor.onSubmit!("/shrimpy");
  await harness.mode.defaultEditor.onSubmit!("/share");
  await harness.mode.defaultEditor.onSubmit!("/hello");

  const chat = stripAnsi(harness.renderChat());
  assert.match(chat, /Agents/);
  assert.match(chat, /\* admin root=agents\/admin/);
  assert.match(chat, /\/settings\s+Open unified Shrimpy and Pi settings/);
  assert.match(chat, /\/changelog\s+Show the Shrimpy changelog/);
  assert.deepEqual(harness.statuses, ["Share is hidden in Shrimpy for now"]);
  assert.deepEqual(harness.submissions, ["/hello"]);
});

test("Shrimpy replaces Pi's changelog with inline Shrimpy release notes", async () => {
  initTheme("dark", false);
  const workspace = createWorkspace();
  const runtime = createAppRuntime({ workspace } as never);
  const harness = createModeHarness();

  installShrimpyInlineCommands(harness.mode as never, {
    runtime,
    agentId: "shrimpy",
    sessionId: "local/main",
    purpose: "interactive",
    cwd: workspace,
  });
  harness.mode.setupEditorSubmitHandler();
  await harness.mode.defaultEditor.onSubmit!("/changelog");

  const chat = stripAnsi(harness.renderChat());
  assert.match(chat, /What's New in Shrimpy/);
  assert.match(chat, /Shrimpy Changelog/);
  assert.doesNotMatch(chat, /Pi changelog/);
});

test("inline compatibility degrades to public command handlers when Pi internals change", () => {
  assert.doesNotThrow(() => installShrimpyInlineCommands({} as never, {} as never));
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
      submissions.push("Pi changelog");
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

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-inline-commands-"));
  mkdirSync(join(workspace, "config"), { recursive: true });
  mkdirSync(join(workspace, "channels"), { recursive: true });
  writeFileSync(
    join(workspace, "config", "shrimpy.json"),
    JSON.stringify({ workspace }),
  );
  return workspace;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, "");
}
