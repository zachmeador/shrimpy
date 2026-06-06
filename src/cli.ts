#!/usr/bin/env node

import { formatVersionLabel } from "./app/metadata.js";
import {
  parseCommandArgs,
  runCommand,
} from "./commands/framework.js";
import {
  renderCliHelp,
  renderCommandPathHelp,
  resolveCliHelpPath,
} from "./commands/help.js";
import {
  COMMAND_REGISTRY,
  configForRegisteredCommand,
} from "./commands/registry.js";
import { brand } from "./util/style.js";

try {
  const rawArgs = process.argv.slice(2);
  const helpPath = resolveCliHelpPath(rawArgs);
  if (helpPath !== null) {
    console.log(renderCommandPathHelp(helpPath));
    process.exit(0);
  }

  const sub = rawArgs[0];
  const registration = sub ? COMMAND_REGISTRY[sub] : undefined;
  if (registration) {
    const handler = await registration.load();
    const config = registration.requiresConfig
      ? configForRegisteredCommand(
        registration,
        (await import("./config/index.js")).loadConfig,
      )
      : configForRegisteredCommand(registration, () => {
        throw new Error("command does not require config");
      });
    const code = await runCommand(handler, rawArgs.slice(1), config);
    process.exit(code);
  }

  const { values, positionals } = parseCommandArgs({
    args: rawArgs,
    options: {
      agent: { type: "string", short: "a" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      "model-policy": { type: "string" },
      thinking: { type: "string" },
      skill: { type: "string", short: "k", multiple: true },
    },
    allowPositionals: true,
    strict: true,
    usage: renderCliHelp(),
  });

  if (values.help) {
    if (positionals.length > 0) {
      console.error(`unknown command or help topic: ${positionals.join(" ")}`);
      console.error(`Run "shrimpy --help" for default help, "shrimpy help all" for all commands, or use "--" before a prompt that should include help-like text.`);
      process.exit(1);
    }
    console.log(renderCliHelp());
    process.exit(0);
  }

  if (values.version) {
    console.log(brand(formatVersionLabel()));
    process.exit(0);
  }

  const { resolveWorkspacePath } = await import("./config/index.js");
  const {
    formatThinkingInputs,
    parseThinkingLevel,
  } = await import("./inference/thinking.js");
  const { bootstrapInteractiveCompletion } = await import("./commands/completion-runtime.js");
  const { runShrimpyTuiCommandSession } = await import("./commands/tui.js");

  const prompt = positionals.length > 0 ? positionals.join(" ") : undefined;
  const thinking = values.thinking === undefined
    ? undefined
    : parseThinkingLevel(values.thinking);
  if (values.thinking !== undefined && thinking === undefined) {
    throw new Error(`thinking level must be one of: ${formatThinkingInputs()}`);
  }

  const code = await runShrimpyTuiCommandSession({
    workspace: resolveWorkspacePath(),
  }, {
    agentId: values.agent,
    channel: "tui",
    sessionType: "tui",
    provider: values.provider,
    model: values.model,
    modelPolicy: values["model-policy"],
    thinking,
    skills: values.skill,
    initialMessage: prompt,
    cwd: process.cwd(),
  }, {
    beforeLaunch: bootstrapInteractiveCompletion,
  });
  process.exit(code);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
