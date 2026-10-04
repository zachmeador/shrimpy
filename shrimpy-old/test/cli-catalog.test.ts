import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CLI_COMMAND_CATALOG,
  COMMAND_REGISTRY,
  configForRegisteredCommand,
  renderCommandUsage,
  renderGroupUsage,
  resolveConfigRequirement,
} from "../dist/commands/catalog.js";
import { renderShellCompletion } from "../dist/commands/completion/script.js";
import {
  installCompletion,
  isCompletionInstalled,
  resolveCompletionCachePath,
} from "../dist/commands/completion/runtime.js";
import { renderCliHelp } from "../dist/commands/help.js";

describe("CLI catalog", () => {
  test("generates group usage from shared metadata", () => {
    const usage = renderGroupUsage("channels");

    assert.match(usage, /shrimpy channels read <name> \[--limit N\] \[--full\] \[--json\]/);
    assert.match(usage, /shrimpy channels join <name> --agent <id> \[--json\]/);
    assert.match(usage, /shrimpy channels leave <name> --agent <id> \[--json\]/);
  });

  test("catalogs model policy management commands", () => {
    const usage = renderGroupUsage("models");

    assert.match(usage, /shrimpy models policies \[list\] \[--json\]/);
    assert.match(usage, /shrimpy models policies show <name> \[--json\]/);
    assert.match(usage, /shrimpy models policies set <name> --candidate <provider>\/<model> \.\.\. \[--json\]/);
    assert.match(usage, /shrimpy models policies add-candidate <name> <provider>\/<model> \[--index <n>\] \[--json\]/);
    assert.match(usage, /shrimpy models policies remove-candidate <name> <provider>\/<model> \[--json\]/);
    assert.match(usage, /shrimpy models policies move-candidate <name> <provider>\/<model> --index <n> \[--json\]/);
  });

  test("catalogs the chat command", () => {
    const usage = renderCommandUsage(["chat"]);

    assert.match(usage, /shrimpy chat \[agent\]/);
    assert.match(usage, /\[--model-policy <name>\]/);
    assert.match(usage, /\[--skill <id>\]/);
  });

  test("generates top-level help from the catalog", () => {
    const help = renderCliHelp();
    const longestLine = Math.max(...stripAnsi(help).split("\n").map((line) => line.length));

    assert.match(help, /Session Commands:/);
    assert.match(help, /shrimpy chat \[agent\]/);
    assert.match(help, /shrimpy channels read <name> \[--limit N\] \[--full\] \[--json\]/);
    assert.match(help, /shrimpy help all/);
    assert.doesNotMatch(help, /shrimpy completion zsh/);
    assert.doesNotMatch(help, /shrimpy context sources run/);
    assert.doesNotMatch(help, /shrimpy gateway logs/);
    assert.ok(
      longestLine <= 80,
      `expected top-level help lines to stay within 80 columns, got ${longestLine}`,
    );
  });

  test("generates full help from the catalog", () => {
    const help = renderCliHelp({ full: true });

    assert.match(help, /shrimpy completion zsh/);
    assert.match(help, /shrimpy context \[--agent <id>\] \[--session <id>\]/);
    assert.match(help, /shrimpy context sources run/);
    assert.match(help, /shrimpy context producers run/);
    assert.match(help, /shrimpy gateway logs/);
  });

  test("generates shell completion from the command tree", () => {
    const bash = renderShellCompletion("bash");
    const zsh = renderShellCompletion("zsh");

    assert.match(bash, /complete -F _shrimpy_completion shrimpy/);
    assert.match(bash, /skip_next=1; continue/);
    assert.match(bash, /"agent"\) suggestions="[^"]*channel-policy[^"]*list[^"]*run/);
    assert.match(bash, /"channels"\) suggestions="[^"]*join[^"]*leave[^"]*read/);
    assert.match(bash, /suggestions="[^"]*chat[^"]*help[^"]*setup/);
    assert.doesNotMatch(bash, /suggestions="[^"]*mechanic/);
    assert.match(bash, /"help"\) suggestions="all/);
    assert.match(bash, /""\) suggestions="[^"]*--workspace[^"]*chat/);
    assert.match(bash, /value_options="[^"]*--workspace/);
    assert.match(bash, /"chat"\) suggestions="[^"]*--model-policy[^"]*--skill/);
    assert.match(bash, /"models"\) suggestions="[^"]*policies[^"]*resolve/);
    assert.match(bash, /"models policies"\) suggestions="[^"]*add-candidate[^"]*list[^"]*move-candidate[^"]*remove-candidate[^"]*set[^"]*show/);
    assert.match(bash, /"models policies set"\) suggestions="[^"]*--candidate[^"]*--json/);
    assert.match(zsh, /#compdef shrimpy/);
    assert.match(zsh, /compdef _shrimpy shrimpy/);
    assert.doesNotMatch(zsh, /\n_shrimpy "\$@"$/);
    assert.match(zsh, /skip_next=1/);
    assert.match(zsh, /"context sources"\) suggestions="list run"/);
    assert.match(zsh, /"context producers"\) suggestions="list run"/);
    assert.match(zsh, /"models policies"\) suggestions="[^"]*add-candidate[^"]*list[^"]*move-candidate[^"]*remove-candidate[^"]*set[^"]*show/);
  });

  test("completion install writes a cached zsh source block idempotently", async () => {
    const home = mkdtempSync(join(tmpdir(), "shrimpy-completion-home-"));
    const state = mkdtempSync(join(tmpdir(), "shrimpy-completion-state-"));
    const env = { ...process.env, HOME: home, XDG_STATE_HOME: state };
    try {
      const first = await installCompletion("zsh", env);
      const second = await installCompletion("zsh", env);
      const profile = readFileSync(join(home, ".zshrc"), "utf-8");
      const cachePath = resolveCompletionCachePath("zsh", env);

      assert.equal(first.changed, true);
      assert.equal(second.changed, false);
      assert.equal(await isCompletionInstalled("zsh", env), true);
      assert.equal(existsSync(cachePath), true);
      assert.equal(profile.match(/# Shrimpy Completion/g)?.length, 1);
      assert.match(profile, new RegExp(escapeRegExp(`source '${cachePath}'`)));
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(state, { recursive: true, force: true });
    }
  });

  test("catalog top-level paths match dispatch registry keys", () => {
    const catalogCommands = [
      ...new Set(CLI_COMMAND_CATALOG.flatMap((command) => command.path[0] ? [command.path[0]] : [])),
    ].sort();

    assert.deepEqual(catalogCommands, Object.keys(COMMAND_REGISTRY).sort());
  });

  test("command catalog keeps command handlers lazy", async () => {
    const catalog = readFileSync("dist/commands/catalog.js", "utf-8");

    assert.doesNotMatch(catalog, /from "\.\/channels\/index\.js"/);
    assert.match(catalog, /import\("\.\/channels\/index\.js"\)/);
    assert.equal("handler" in COMMAND_REGISTRY.channels, false);
    assert.equal(typeof COMMAND_REGISTRY.channels.load, "function");
    assert.equal((await COMMAND_REGISTRY.channels.load()).name, "cmdChannels");
  });

  test("help and completion commands do not require workspace config", async () => {
    const helpRegistration = COMMAND_REGISTRY.help;
    const completionRegistration = COMMAND_REGISTRY.completion;
    const helpHandler = await helpRegistration.load();
    const completionHandler = await completionRegistration.load();

    assert.equal(helpRegistration.requiresConfig, false);
    assert.equal(completionRegistration.requiresConfig, false);
    assert.equal(typeof helpHandler, "function");
    assert.equal(typeof completionHandler, "function");
    assert.deepEqual(configForRegisteredCommand(helpRegistration, () => {
      throw new Error("should not load config");
    }), { workspace: process.cwd() });
    assert.deepEqual(configForRegisteredCommand(completionRegistration, () => {
      throw new Error("should not load config");
    }), { workspace: process.cwd() });
  });

  test("setup command resolves only the workspace path before loading", () => {
    const registration = COMMAND_REGISTRY.setup;

    assert.equal(registration.requiresConfig, "workspace");
    const config = configForRegisteredCommand(registration, () => {
      throw new Error("should not load full config");
    });
    assert.equal(typeof config.workspace, "string");
    assert.equal(config.workspace.length > 0, true);
  });

  test("TUI registered commands resolve only the workspace before the setup gate", () => {
    const chatRegistration = COMMAND_REGISTRY.chat;
    const agentRegistration = COMMAND_REGISTRY.agent;

    assert.equal(resolveConfigRequirement(chatRegistration, ["mechanic"]), "workspace");
    assert.equal(resolveConfigRequirement(agentRegistration, ["tui", "career"]), "workspace");
    assert.equal(resolveConfigRequirement(agentRegistration, ["show", "career"]), true);
    assert.equal(resolveConfigRequirement(agentRegistration, ["run", "career", "hello"]), true);

    assert.equal(configForRegisteredCommand(chatRegistration, () => {
      throw new Error("should not load full config");
    }, ["mechanic"]).workspace.length > 0, true);
    assert.equal(configForRegisteredCommand(agentRegistration, () => {
      throw new Error("should not load full config");
    }, ["tui", "career"]).workspace.length > 0, true);
  });

  test("reference docs mention the generated completion commands", () => {
    const docs = readFileSync("docs/reference/cli.md", "utf-8");

    assert.match(docs, new RegExp(escapeRegExp(`\`${renderCommandUsage(["chat"]).replace(/^usage: /, "")}\``)));
    assert.match(docs, new RegExp(escapeRegExp(`\`${renderCommandUsage(["help"]).replace(/^usage: /, "")}\``)));
    assert.match(docs, new RegExp(escapeRegExp(`\`${renderCommandUsage(["help", "all"]).replace(/^usage: /, "")}\``)));
    assert.match(docs, new RegExp(escapeRegExp(`\`${renderCommandUsage(["completion", "bash"]).replace(/^usage: /, "")}\``)));
    assert.match(docs, new RegExp(escapeRegExp(`\`${renderCommandUsage(["completion", "zsh"]).replace(/^usage: /, "")}\``)));
    assert.match(docs, /`shrimpy completion install \[bash\\\|zsh\]`/);
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}
