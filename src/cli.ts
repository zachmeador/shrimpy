#!/usr/bin/env node

import {
  runCommand,
} from "./commands/framework.js";
import {
  formatVersionLabel,
} from "./app/metadata.js";
import {
  renderCommandPathHelp,
  resolveCliHelpPath,
} from "./commands/help.js";
import {
  COMMAND_REGISTRY,
  configForRegisteredCommand,
} from "./commands/registry.js";
import {
  brand,
} from "./util/style.js";

try {
  const rawArgs = process.argv.slice(2);
  const helpPath = resolveCliHelpPath(rawArgs);
  if (helpPath !== null) {
    console.log(renderCommandPathHelp(helpPath));
    process.exit(0);
  }

  if (rawArgs.length === 1 && (rawArgs[0] === "--version" || rawArgs[0] === "-v")) {
    console.log(brand(formatVersionLabel()));
    process.exit(0);
  }

  const sub = rawArgs[0];
  const registration = sub ? COMMAND_REGISTRY[sub] : undefined;
  if (registration) {
    const commandArgs = rawArgs.slice(1);
    const handler = await registration.load();
    const config = configForRegisteredCommand(
      registration,
      (await import("./config/index.js")).loadConfig,
      commandArgs,
    );
    const code = await runCommand(handler, commandArgs, config);
    process.exit(code);
  }

  const { resolveWorkspacePath } = await import("./config/index.js");
  const { cmdRootTui } = await import("./commands/root.js");

  const code = await runCommand(cmdRootTui, rawArgs, {
    workspace: resolveWorkspacePath(),
  });
  process.exit(code);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
