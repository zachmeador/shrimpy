import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getMarkdownTheme, initTheme } from "@earendil-works/pi-coding-agent";
import { formatVersionLabel } from "../dist/app/metadata.js";
import { createAppRuntime } from "../dist/app/runtime.js";
import {
  findActiveSessionFile,
  listArchivedSessionDirs,
} from "../dist/sessions/index.js";
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
    join(workspace, "state", "watch-clock.json"),
    JSON.stringify({
      "admin/daily-check": { nextRunAtMs: Date.parse("2030-01-01T00:00:00.000Z") },
    }),
    "utf-8",
  );
  writeFileSync(
    join(workspace, "agents", "admin", "watches.json"),
    JSON.stringify([{
      id: "daily-check",
      trigger: { kind: "time", everyMs: 60_000 },
      concurrencyPolicy: "forbid",
      action: {
        kind: "message",
        channel: "home",
        text: "Run a daily workspace check.",
      },
    }]),
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
  await mode.defaultEditor.onSubmit!("/status watches");
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
  assert.match(chat, /Configured: 1/);
  assert.match(chat, /Agent admin: 1/);
  assert.match(chat, /\* admin\/daily-check enabled time every 60000ms action=message -> home/);
  assert.match(chat, /shrimpy watches history <agent-id>\/<watch-id>/);
  assert.match(chat, /Agents/);
  assert.match(chat, /\* admin root=agents\/admin cwd=agents\/admin tools=send_message thinking=high/);
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

test("Shrimpy command surface archives the previous TUI session after /new succeeds", async () => {
  initTheme("dark", false);
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-command-surface-test-"));
  const sessionDir = join(workspace, "agents", "shrimpy", "sessions", "tui");
  mkdirSync(sessionDir, { recursive: true });
  const previousSessionFile = join(sessionDir, "previous.jsonl");
  const currentSessionFile = join(sessionDir, "current.jsonl");
  writeSessionFile(previousSessionFile, "previous");
  const runtime = createAppRuntime({ workspace } as any);
  const { mode } = createModeHarness({
    sessionFile: previousSessionFile,
    handleClearCommand: () => {
      writeSessionFile(currentSessionFile, "current");
      mode.session.sessionFile = currentSessionFile;
    },
  });

  installShrimpyCommandSurface(mode as never, {
    runtime,
    agentId: "shrimpy",
    channel: "tui",
    sessionType: "tui",
    cwd: workspace,
  });
  mode.setupEditorSubmitHandler();

  await mode.defaultEditor.onSubmit!("/new");

  assert.deepEqual(listArchivedSessionDirs(sessionDir), [previousSessionFile]);
  assert.equal(findActiveSessionFile(sessionDir), currentSessionFile);
  assert.match(readFileSync(previousSessionFile, "utf-8"), /"state":"archived"/);
  assert.doesNotMatch(readFileSync(currentSessionFile, "utf-8"), /"state":"archived"/);
});

test("Shrimpy command surface does not archive a TUI session when /new is cancelled", async () => {
  initTheme("dark", false);
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-command-surface-test-"));
  const sessionDir = join(workspace, "agents", "shrimpy", "sessions", "tui");
  mkdirSync(sessionDir, { recursive: true });
  const previousSessionFile = join(sessionDir, "previous.jsonl");
  writeSessionFile(previousSessionFile, "previous");
  const runtime = createAppRuntime({ workspace } as any);
  const { mode } = createModeHarness({
    sessionFile: previousSessionFile,
  });

  installShrimpyCommandSurface(mode as never, {
    runtime,
    agentId: "shrimpy",
    channel: "tui",
    sessionType: "tui",
    cwd: workspace,
  });
  mode.setupEditorSubmitHandler();

  await mode.defaultEditor.onSubmit!("/new");

  assert.deepEqual(listArchivedSessionDirs(sessionDir), []);
  assert.equal(findActiveSessionFile(sessionDir), previousSessionFile);
  assert.doesNotMatch(readFileSync(previousSessionFile, "utf-8"), /"state":"archived"/);
});

function createModeHarness(opts: {
  thinkingLevel?: string;
  availableThinkingLevels?: string[];
  sessionFile?: string;
  handleClearCommand?: () => void | Promise<void>;
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
      sessionFile: opts.sessionFile,
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
        if (text.trim() === "/new") {
          mode.editor.setText("");
          await mode.handleClearCommand();
          return;
        }
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
    async handleClearCommand(): Promise<void> {
      await opts.handleClearCommand?.();
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

function writeSessionFile(path: string, id: string): void {
  const now = new Date().toISOString();
  writeFileSync(
    path,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id,
      timestamp: now,
      cwd: process.cwd(),
    })}\n${JSON.stringify({
      type: "message",
      id: `${id}-message`,
      parentId: null,
      timestamp: now,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        api: "test",
        provider: "test",
        model: "test",
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
        timestamp: Date.now(),
      },
    })}\n`,
    "utf-8",
  );
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
