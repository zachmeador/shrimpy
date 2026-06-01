import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  renderCommandUsage,
  renderGroupUsage,
} from "../dist/commands/catalog.js";
import { renderShellCompletion } from "../dist/commands/completion-script.js";
import { renderCliHelp } from "../dist/commands/help.js";
import {
  COMMAND_REGISTRY,
  configForRegisteredCommand,
} from "../dist/commands/registry.js";

describe("CLI catalog", () => {
  test("generates group usage from shared metadata", () => {
    const usage = renderGroupUsage("channels");

    assert.match(usage, /shrimpy channels read <name> \[--limit N\] \[--json\]/);
    assert.match(usage, /shrimpy channels join <name> --agent <id> \[--json\]/);
    assert.match(usage, /shrimpy channels leave <name> --agent <id> \[--json\]/);
  });

  test("generates top-level help from the catalog", () => {
    const help = renderCliHelp();
    const longestLine = Math.max(...stripAnsi(help).split("\n").map((line) => line.length));

    assert.match(help, /Session Commands:/);
    assert.match(help, /shrimpy channels read <name> \[--limit N\] \[--json\]/);
    assert.match(help, /shrimpy completion zsh/);
    assert.ok(
      longestLine <= 80,
      `expected top-level help lines to stay within 80 columns, got ${longestLine}`,
    );
  });

  test("generates shell completion from the command tree", () => {
    const bash = renderShellCompletion("bash");
    const zsh = renderShellCompletion("zsh");

    assert.match(bash, /complete -F _shrimpy_completion shrimpy/);
    assert.match(bash, /skip_next=1; continue/);
    assert.match(bash, /"agent"\) suggestions="[^"]*attention[^"]*list[^"]*run/);
    assert.match(bash, /"channels"\) suggestions="[^"]*join[^"]*leave[^"]*read/);
    assert.match(zsh, /#compdef shrimpy/);
    assert.match(zsh, /skip_next=1/);
    assert.match(zsh, /"context sources"\) suggestions="list run"/);
  });

  test("completion command does not require workspace config", () => {
    const registration = COMMAND_REGISTRY.completion;

    assert.equal(registration.requiresConfig, false);
    assert.deepEqual(configForRegisteredCommand(registration, () => {
      throw new Error("should not load config");
    }), { workspace: process.cwd() });
  });

  test("reference docs mention the generated completion commands", () => {
    const docs = readFileSync("docs/reference/cli.md", "utf-8");

    assert.match(docs, new RegExp(escapeRegExp(`\`${renderCommandUsage(["completion", "bash"]).replace(/^usage: /, "")}\``)));
    assert.match(docs, new RegExp(escapeRegExp(`\`${renderCommandUsage(["completion", "zsh"]).replace(/^usage: /, "")}\``)));
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}
