import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createCommandGroup,
  parseCommandArgs,
  runCommand,
} from "../dist/commands/framework.js";

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
});
