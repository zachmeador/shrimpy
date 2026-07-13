import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createCommandGroup,
  parseCommandArgs,
  runCommand,
} from "../dist/commands/framework.js";
import { createShrimpyTuiCommand } from "../dist/commands/tui.js";

describe("command framework", () => {
  test("dispatches subcommands with action-free argv", async () => {
    const command = createCommandGroup({
      name: "demo",
      usage: "usage: demo <show>",
      commands: {
        show: ({ argv }) => {
          assert.deepEqual(argv, ["thing"]);
          return 0;
        },
      },
    });

    assert.equal(await command(["show", "thing"], {} as any), 0);
  });

  test("routes flag-first argv to a default command", async () => {
    const command = createCommandGroup({
      name: "demo",
      usage: "usage: demo [list]",
      default: ({ argv }) => {
        assert.deepEqual(argv, ["--json"]);
        return 0;
      },
      commands: {},
    });

    assert.equal(await command(["--json"], {} as any), 0);
  });

  test("can route positional argv to a default command when requested", async () => {
    const command = createCommandGroup({
      name: "demo",
      usage: "usage: demo [prompt]",
      defaultWhen: () => true,
      default: ({ argv }) => {
        assert.deepEqual(argv, ["hello"]);
        return 0;
      },
      commands: {},
    });

    assert.equal(await command(["hello"], {} as any), 0);
  });

  test("maps usage errors to stderr and exit code", async () => {
    const originalError = console.error;
    const lines: string[] = [];
    console.error = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };

    try {
      const code = await runCommand(
        async () => {
          parseCommandArgs({
            args: ["--bad"],
            options: {},
            strict: true,
            usage: "usage: demo",
          });
          return 0;
        },
        [],
        {} as any,
      );

      assert.equal(code, 1);
      assert.match(lines.join("\n"), /Unknown option '--bad'/);
      assert.match(lines.join("\n"), /usage: demo/);
    } finally {
      console.error = originalError;
    }
  });

  test("resolves TUI command results through the shared launcher", async () => {
    let loadedWorkspace: string | undefined;
    let launched = false;

    const code = await runCommand(
      async () =>
        createShrimpyTuiCommand({
          session: { namespace: "local", name: "main" },
          purpose: "interactive",
          cwd: "/tmp/shrimpy-command-framework-test",
        }, {
          resolveSetupState: async () => ({ kind: "ready", models: [] }),
          loadConfig: (workspace) => {
            loadedWorkspace = workspace;
            return { workspace } as any;
          },
          createRuntime: () => ({} as any),
          launchSession: async () => {
            launched = true;
          },
        }),
      [],
      { workspace: "/tmp/shrimpy-command-framework-workspace" } as any,
    );

    assert.equal(code, 0);
    assert.equal(loadedWorkspace, "/tmp/shrimpy-command-framework-workspace");
    assert.equal(launched, true);
  });
});
