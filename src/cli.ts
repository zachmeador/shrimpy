#!/usr/bin/env node

import { loadConfig } from "./config/index.js";
import { createAppRuntime } from "./app/index.js";
import { formatVersionLabel } from "./app/metadata.js";
import {
  parseCommandArgs,
  runCommand,
} from "./commands/framework.js";
import { renderCliHelp } from "./commands/help.js";
import {
  COMMAND_REGISTRY,
  configForRegisteredCommand,
} from "./commands/registry.js";
import { bootstrapInteractiveCompletion } from "./commands/completion-runtime.js";
import {
  formatThinkingInputs,
  parseThinkingLevel,
} from "./inference/thinking.js";
import { runInteractiveAgentSession } from "./sessions/index.js";
import { brand } from "./util/style.js";

try {
  await bootstrapInteractiveCompletion();

  const sub = process.argv[2];
  const registration = sub ? COMMAND_REGISTRY[sub] : undefined;
  if (registration) {
    const config = configForRegisteredCommand(registration, loadConfig);
    const code = await runCommand(registration.handler, process.argv.slice(3), config);
    process.exit(code);
  }

  const { values, positionals } = parseCommandArgs({
    args: process.argv.slice(2),
    options: {
      agent: { type: "string", short: "a" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      thinking: { type: "string" },
      skill: { type: "string", short: "k", multiple: true },
    },
    allowPositionals: true,
    strict: true,
    usage: renderCliHelp(),
  });

  if (values.help) {
    console.log(renderCliHelp());
    process.exit(0);
  }

  if (values.version) {
    console.log(brand(formatVersionLabel()));
    process.exit(0);
  }

  const prompt = positionals.length > 0 ? positionals.join(" ") : undefined;
  const thinking = values.thinking === undefined
    ? undefined
    : parseThinkingLevel(values.thinking);
  if (values.thinking !== undefined && thinking === undefined) {
    throw new Error(`thinking level must be one of: ${formatThinkingInputs()}`);
  }

  const config = loadConfig();
  const runtime = createAppRuntime(config);
  await runInteractiveAgentSession({
    runtime,
    agentId: values.agent,
    channel: "tui",
    sessionType: "tui",
    provider: values.provider,
    model: values.model,
    thinking,
    skills: values.skill,
    initialMessage: prompt,
    cwd: process.cwd(),
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
