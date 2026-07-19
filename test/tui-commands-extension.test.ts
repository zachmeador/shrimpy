import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { createAppRuntime } from "../dist/app/runtime.js";
import { createShrimpyTuiCommandExtensionFactory } from "../dist/tui/shrimpy-commands.js";

test("Shrimpy TUI commands use public extension registration and custom UI", async () => {
  initTheme("dark", false);
  const workspace = createWorkspace();
  const runtime = createAppRuntime({
    workspace,
    agents: [{ id: "admin", root: "agents/admin", tools: ["send_message"] }],
  } as never);
  const commands = new Map<string, Command>();
  createShrimpyTuiCommandExtensionFactory({
    runtime,
    agentId: "admin",
    sessionId: "local/main",
    purpose: "interactive",
    cwd: workspace,
  })({
    registerCommand(name: string, command: Command): void {
      assert.equal(commands.has(name), false);
      commands.set(name, command);
    },
  } as never);

  assert.deepEqual([...commands.keys()], ["status", "shrimpy"]);

  const panels: string[] = [];
  const ctx = createCommandContext(workspace, panels);
  await commands.get("status")!.handler("agents", ctx);
  await commands.get("shrimpy")!.handler("", ctx);
  await commands.get("shrimpy")!.handler("changelog", ctx);

  assert.match(panels[0]!, /Active: admin/);
  assert.match(panels[0]!, /\* admin root=agents\/admin/);
  assert.match(panels[1]!, /\/shrimpy settings/);
  assert.match(panels[1]!, /\/settings\s+Open unified Shrimpy and Pi settings/);
  assert.match(panels[1]!, /\/agents \[id\]\s+Navigate agents and local sessions/);
  assert.match(panels[1]!, /\/thinking\s+Open the supported session thinking menu/);
  assert.match(panels[1]!, /\/changelog\s+Show the Shrimpy changelog/);
  assert.match(panels[1]!, /model guardrails, and changelog surface/);
  assert.match(panels[2]!, /Shrimpy Changelog/);
});

test("/shrimpy settings persists Shrimpy-only future-session defaults", async () => {
  const workspace = createWorkspace();
  const runtime = createAppRuntime({ workspace } as never);
  let command: Command | undefined;
  createShrimpyTuiCommandExtensionFactory({
    runtime,
    agentId: "shrimpy",
    sessionId: "local/main",
    purpose: "interactive",
    cwd: workspace,
  })({
    registerCommand(name: string, value: Command): void {
      if (name === "shrimpy") command = value;
    },
  } as never);

  const selections = [
    "Skill context (new sessions): on",
    "Done",
  ];
  await command!.handler("settings", {
    mode: "tui",
    cwd: workspace,
    ui: {
      async select(): Promise<string | undefined> {
        return selections.shift();
      },
      notify(): void {},
    },
  });

  const config = JSON.parse(
    readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
  ) as { runtime?: { noSkills?: boolean } };
  assert.equal(config.runtime?.noSkills, true);
  assert.equal(runtime.resolved.runtime.noSkills, true);
  assert.equal(runtime.config.runtime?.noSkills, true);
});

interface Command {
  handler(args: string, ctx: any): Promise<void>;
}

function createCommandContext(workspace: string, panels: string[]) {
  return {
    mode: "tui",
    cwd: workspace,
    model: { provider: "test", id: "model" },
    ui: {
      async custom(factory: Function): Promise<void> {
        const panel = await factory({}, identityTheme, {}, () => {});
        panels.push(stripAnsi(panel.render(140).join("\n")));
      },
      notify(): void {},
    },
  };
}

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-tui-commands-"));
  mkdirSync(join(workspace, "config"), { recursive: true });
  mkdirSync(join(workspace, "channels"), { recursive: true });
  writeFileSync(
    join(workspace, "config", "shrimpy.json"),
    JSON.stringify({ workspace }),
  );
  return workspace;
}

const identityTheme = {
  bold(text: string): string {
    return text;
  },
  fg(_color: string, text: string): string {
    return text;
  },
};

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, "");
}
