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
  test("registers consolidated Shrimpy status command for autocomplete", async () => {
    const commands = registerCommands();

    assert.deepEqual([...commands.keys()], ["status"]);

    const status = commands.get("status")!;
    const completions = await status.getArgumentCompletions!("ch");
    assert.deepEqual(completions.map((completion) => completion.value), ["channels"]);
  });

  test("status command handler delegates rendering to the TUI command surface", async () => {
    const commands = registerCommands();
    const notifications: string[] = [];

    await commands.get("status")!.handler("agents", commandContext({ notifications }));

    assert.deepEqual(notifications, ["/status is rendered by the Shrimpy TUI command surface."]);
  });

  test("registers /shrimpy help separately for the existing hello extension", async () => {
    let handler: Handler | undefined;
    registerShrimpyHelpCommand({
      registerCommand(name: string, options: any) {
        assert.equal(name, "shrimpy");
        handler = options.handler;
      },
    } as any);

    const notifications: string[] = [];
    await handler!("", commandContext({ notifications }));

    assert.deepEqual(notifications, ["/shrimpy is rendered by the Shrimpy TUI command surface."]);
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

function commandContext(opts: { notifications?: string[] } = {}) {
  return {
    ui: {
      notify(text: string) {
        opts.notifications?.push(text);
      },
    },
  };
}
