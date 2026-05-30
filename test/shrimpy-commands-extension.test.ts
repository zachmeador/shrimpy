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
type CompletionProvider = (prefix: string) => Array<{ value: string; label: string }> | Promise<Array<{ value: string; label: string }>>;

interface RegisteredCommandForTest {
  handler: Handler;
  getArgumentCompletions?: CompletionProvider;
}

describe("shrimpy TUI commands extension", () => {
  test("registers consolidated Shrimpy status command", async () => {
    const commands = new Map<string, unknown>();

    shrimpyCommandsExtension({
      registerCommand(name: string, options: unknown) {
        commands.set(name, options);
      },
    } as any);

    assert.deepEqual([...commands.keys()], ["status"]);

    const status = commands.get("status") as RegisteredCommandForTest;
    const completions = await status.getArgumentCompletions!("ch");
    assert.deepEqual(completions.map((completion) => completion.value), ["channels"]);
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
    const panels: string[][] = [];
    const ctx = commandContext({
      cwd: workspace,
      entries: [metadataEntry({ workspacePath: workspace, agentId: "admin" })],
      panels,
      model: { provider: "openai", modelId: "gpt-test" },
    });

    await commands.get("status")!.handler("agents", ctx);
    assert.match(panels.at(-1)!.join("\n"), /\* admin root=agents\/admin tools=send_message thinking=high/);

    await commands.get("status")!.handler("channels", ctx);
    assert.match(panels.at(-1)!.join("\n"), /home 2 msgs/);

    await commands.get("status")!.handler("skills", ctx);
    assert.match(panels.at(-1)!.join("\n"), /workspace-skill \[workspace\]/);
    assert.match(panels.at(-1)!.join("\n"), /agent-skill \[agent\]/);

    await commands.get("status")!.handler("model", ctx);
    assert.match(panels.at(-1)!.join("\n"), /active: openai\/gpt-test/);

    await commands.get("status")!.handler("wat", ctx);
    assert.match(panels.at(-1)!.join("\n"), /Unknown section: wat/);
  });

  test("registers /shrimpy help separately for the existing hello extension", async () => {
    let handler: Handler | undefined;
    registerShrimpyHelpCommand({
      registerCommand(name: string, options: any) {
        assert.equal(name, "shrimpy");
        handler = options.handler;
      },
    } as any);

    const panels: string[][] = [];
    await handler!("", commandContext({ panels }));

    assert.match(panels[0].join("\n"), /Shrimpy commands/);
    assert.match(panels[0].join("\n"), /\/status \[section\]/);
    assert.doesNotMatch(panels[0].join("\n"), /\/workspace/);
  });
});

function registerCommands(): Map<string, RegisteredCommandForTest> {
  const commands = new Map<string, RegisteredCommandForTest>();
  shrimpyCommandsExtension({
    registerCommand(name: string, options: any) {
      commands.set(name, {
        handler: options.handler,
        getArgumentCompletions: options.getArgumentCompletions,
      });
    },
  } as any);
  return commands;
}

function commandContext(opts: {
  cwd?: string;
  entries?: unknown[];
  panels?: string[][];
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
      setWidget() {
        throw new Error("Status commands should render through custom modal UI");
      },
      async custom(factory: any) {
        let closeCount = 0;
        const component = await factory(undefined, undefined, undefined, () => {
          closeCount += 1;
        });
        opts.panels?.push(component.render(80));
        component.handleInput?.("\u001b");
        component.handleInput?.("\u0003");
        assert.equal(closeCount, 1);
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
