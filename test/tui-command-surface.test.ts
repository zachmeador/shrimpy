import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getMarkdownTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { formatVersionLabel } from "../dist/app/metadata.js";
import { createAppRuntime } from "../dist/app/runtime.js";
import { installShrimpyCommandSurface } from "../dist/tui/shrimpy-command-surface.js";

test("Shrimpy command surface appends status output to the TUI log", async () => {
  initTheme("dark", false);
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-command-surface-test-"));
  mkdirSync(join(workspace, "channels"), { recursive: true });
  mkdirSync(join(workspace, "state"), { recursive: true });
  mkdirSync(join(workspace, "skills", "workspace-skill"), { recursive: true });
  mkdirSync(join(workspace, "agents", "admin", "skills", "agent-skill"), { recursive: true });
  writeFileSync(join(workspace, "channels", "home.jsonl"), "{}\n{}\n");
  writeFileSync(
    join(workspace, "state", "one-time-schedules.json"),
    JSON.stringify({
      version: 1,
      records: [{
        id: "once-ui",
        targetChannel: "home",
        text: "check later",
        dueAtMs: Date.parse("2030-01-01T00:00:00.000Z"),
        dueAtIso: "2030-01-01T00:00:00.000Z",
        ownerAgentId: "admin",
        source: { kind: "cli", agentId: "admin" },
        status: "pending",
        createdAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        createdAtIso: "2026-05-01T00:00:00.000Z",
        updatedAtMs: Date.parse("2026-05-01T00:00:00.000Z"),
        updatedAtIso: "2026-05-01T00:00:00.000Z",
      }],
    }),
    "utf-8",
  );
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

  await mode.defaultEditor.onSubmit!("/status");
  await mode.defaultEditor.onSubmit!("/status gateway");
  await mode.defaultEditor.onSubmit!("/status schedules");
  await mode.defaultEditor.onSubmit!("/status agents");
  await mode.defaultEditor.onSubmit!("/status channels");
  await mode.defaultEditor.onSubmit!("/status skills");
  await mode.defaultEditor.onSubmit!("/shrimpy");
  await mode.defaultEditor.onSubmit!("/share");
  await mode.defaultEditor.onSubmit!("/hello");

  const chat = stripAnsi(renderChat());
  assert.match(chat, new RegExp(`Version: ${escapeRegExp(formatVersionLabel())}`));
  assert.match(chat, /Gateway:/);
  assert.match(chat, /\/status gateway/);
  assert.match(chat, /Gateway service:/);
  assert.match(chat, /Tracked channels: 1/);
  assert.match(chat, /shrimpy gateway status/);
  assert.match(chat, /One-time pending: 1/);
  assert.match(chat, /\* once-ui pending -> home/);
  assert.match(chat, /shrimpy schedules list --one-time/);
  assert.match(chat, /Agents/);
  assert.match(chat, /\* admin root=agents\/admin tools=send_message thinking=high/);
  assert.match(chat, /home 2 msgs/);
  assert.match(chat, /workspace-skill \[workspace\]/);
  assert.match(chat, /agent-skill \[agent\]/);
  assert.match(chat, /\/status \[section\]/);
  assert.deepEqual(statuses, ["Share is hidden in Shrimpy for now"]);
  assert.deepEqual(editorTexts, ["", "", "", "", "", "", "", ""]);
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

test("Shrimpy command surface opens Pi thinking selector for bare thinking command", async () => {
  initTheme("dark", false);
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-command-surface-test-"));
  const runtime = createAppRuntime({ workspace } as any);
  const {
    mode,
    editorTexts,
    selectors,
    statuses,
    thinkingChanges,
    footerInvalidations,
    borderUpdates,
  } = createModeHarness({
    thinkingLevel: "minimal",
    availableThinkingLevels: ["off", "minimal", "low"],
  });

  installShrimpyCommandSurface(mode as never, {
    runtime,
    agentId: "shrimpy",
    channel: "home",
    sessionType: "interactive",
    cwd: workspace,
  });
  mode.setupEditorSubmitHandler();

  await mode.defaultEditor.onSubmit!("/thinking");

  assert.deepEqual(editorTexts, [""]);
  assert.equal(selectors.length, 1);
  const rendered = stripAnsi(selectors[0]!.component.render(100).join("\n"));
  assert.match(rendered, /minimal/);
  assert.match(rendered, /Light reasoning/);
  assert.doesNotMatch(rendered, /xhigh/);

  selectors[0]!.focus.onSelect!({ value: "low", label: "low" });

  assert.equal(mode.session.thinkingLevel, "low");
  assert.deepEqual(thinkingChanges, ["low"]);
  assert.deepEqual(statuses, ["Thinking level: low"]);
  assert.equal(footerInvalidations.length, 1);
  assert.equal(borderUpdates.length, 1);
  assert.equal(selectors[0]!.doneCount, 1);
});

function createModeHarness(opts: {
  thinkingLevel?: string;
  availableThinkingLevels?: string[];
} = {}) {
  const submissions: string[] = [];
  const statuses: string[] = [];
  const editorTexts: string[] = [];
  const thinkingChanges: string[] = [];
  const footerInvalidations: true[] = [];
  const borderUpdates: true[] = [];
  const children: Array<{ render(width: number): string[] }> = [];
  const selectors: Array<{
    component: { render(width: number): string[] };
    focus: { onSelect?: (item: { value: string; label: string; description?: string }) => void };
    doneCount: number;
  }> = [];
  const mode = {
    defaultEditor: {} as { onSubmit?: (text: string) => void | Promise<void> },
    showSelector(
      create: (done: () => void) => {
        component: { render(width: number): string[] };
        focus: { onSelect?: (item: { value: string; label: string; description?: string }) => void };
      },
    ): void {
      const selector = { doneCount: 0 } as {
        component: { render(width: number): string[] };
        focus: { onSelect?: (item: { value: string; label: string; description?: string }) => void };
        doneCount: number;
      };
      const created = create(() => {
        selector.doneCount += 1;
      });
      selector.component = created.component;
      selector.focus = created.focus;
      selectors.push(selector);
    },
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
      thinkingLevel: opts.thinkingLevel ?? "medium",
      getAvailableThinkingLevels(): string[] {
        return opts.availableThinkingLevels ?? ["off", "minimal", "low", "medium", "high", "xhigh"];
      },
      setThinkingLevel(level: string): void {
        mode.session.thinkingLevel = level;
        thinkingChanges.push(level);
      },
    },
    footer: {
      invalidate(): void {
        footerInvalidations.push(true);
      },
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
    updateEditorBorderColor(): void {
      borderUpdates.push(true);
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
    selectors,
    thinkingChanges,
    footerInvalidations,
    borderUpdates,
    renderChat(): string {
      return children.flatMap((component) => component.render(100)).join("\n");
    },
  };
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
