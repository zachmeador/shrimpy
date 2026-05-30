import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import shrimpyCommandsExtension, {
  registerShrimpyHelpCommand,
} from "../extensions/shrimpy-commands.ts";

type Handler = (args: string, ctx: any) => Promise<void>;

describe("shrimpy TUI commands extension", () => {
  test("registers additive Shrimpy commands", () => {
    const commands = new Map<string, unknown>();

    shrimpyCommandsExtension({
      registerCommand(name: string, options: unknown) {
        commands.set(name, options);
      },
    } as any);

    assert.deepEqual([...commands.keys()], [
      "workspace",
      "agents",
      "channels",
      "context",
      "skills",
      "models",
      "doctor",
    ]);
  });

  test("renders workspace and agent state from session metadata", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "shrimpy-tui-commands-test-"));
    mkdirSync(join(workspace, "config"), { recursive: true });
    mkdirSync(join(workspace, "channels"), { recursive: true });
    mkdirSync(join(workspace, "skills", "workspace-skill"), { recursive: true });
    mkdirSync(join(workspace, "agents", "admin", "skills", "agent-skill"), { recursive: true });
    writeFileSync(join(workspace, "skills", "workspace-skill", "SKILL.md"), "# Workspace Skill\n");
    writeFileSync(join(workspace, "agents", "admin", "skills", "agent-skill", "SKILL.md"), "# Agent Skill\n");
    writeFileSync(join(workspace, "channels", "home.jsonl"), "{}\n{}\n");
    writeFileSync(
      join(workspace, "config", "shrimpy.json"),
      JSON.stringify({
        agents: [
          { id: "shrimpy" },
          {
            id: "admin",
            root: "agents/admin",
            tools: ["send_message"],
            thinking: "high",
          },
        ],
      }),
    );

    const commands = registerCommands();
    const widgets: Array<{ key: string; lines: string[] }> = [];
    const notifications: string[] = [];
    const ctx = commandContext({
      cwd: workspace,
      entries: [metadataEntry({ workspacePath: workspace, agentId: "admin" })],
      widgets,
      notifications,
      model: { provider: "openai", modelId: "gpt-test" },
    });

    await commands.get("agents")!("", ctx);
    assert.match(widgets.at(-1)!.lines.join("\n"), /\* admin root=agents\/admin tools=send_message thinking=high/);

    await commands.get("channels")!("", ctx);
    assert.match(widgets.at(-1)!.lines.join("\n"), /home 2 msgs/);

    await commands.get("skills")!("", ctx);
    assert.match(widgets.at(-1)!.lines.join("\n"), /workspace-skill \[workspace\]/);
    assert.match(widgets.at(-1)!.lines.join("\n"), /agent-skill \[agent\]/);

    await commands.get("models")!("", ctx);
    assert.match(widgets.at(-1)!.lines.join("\n"), /active: openai\/gpt-test/);
    assert.ok(notifications.includes("Models shown"));
  });

  test("registers /shrimpy help separately for the existing hello extension", async () => {
    let handler: Handler | undefined;
    registerShrimpyHelpCommand({
      registerCommand(name: string, options: any) {
        assert.equal(name, "shrimpy");
        handler = options.handler;
      },
    } as any);

    const widgets: Array<{ key: string; lines: string[] }> = [];
    await handler!("", commandContext({ widgets }));

    assert.match(widgets[0].lines.join("\n"), /Shrimpy commands/);
    assert.match(widgets[0].lines.join("\n"), /\/workspace/);
  });
});

function registerCommands(): Map<string, Handler> {
  const commands = new Map<string, Handler>();
  shrimpyCommandsExtension({
    registerCommand(name: string, options: any) {
      commands.set(name, options.handler);
    },
  } as any);
  return commands;
}

function commandContext(opts: {
  cwd?: string;
  entries?: unknown[];
  widgets?: Array<{ key: string; lines: string[] }>;
  notifications?: string[];
  model?: unknown;
} = {}) {
  return {
    cwd: opts.cwd ?? process.cwd(),
    model: opts.model,
    sessionManager: {
      getEntries() {
        return opts.entries ?? [];
      },
    },
    ui: {
      setWidget(key: string, lines: string[]) {
        opts.widgets?.push({ key, lines });
      },
      notify(text: string) {
        opts.notifications?.push(text);
      },
    },
  };
}

function metadataEntry(input: { workspacePath: string; agentId: string }) {
  return {
    type: "custom",
    customType: "shrimpy_session_metadata",
    data: {
      workspacePath: input.workspacePath,
      agentId: input.agentId,
      sessionType: "tui",
      envKeys: [],
      env: {},
    },
  };
}
