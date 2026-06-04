#!/usr/bin/env node

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
import { brand } from "./util/style.js";

try {
  const sub = process.argv[2];
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
    const code = await runCommand(handler, process.argv.slice(3), config);
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
      "model-policy": { type: "string" },
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

  const isBareShrimpy = positionals.length === 0 &&
    values.agent === undefined &&
    values.provider === undefined &&
    values.model === undefined &&
    values["model-policy"] === undefined &&
    values.thinking === undefined &&
    values.skill === undefined;

  if (isBareShrimpy) {
    const { resolveWorkspacePath } = await import("./config/index.js");
    const { shouldRunSetupBootstrapForRootShrimpy } = await import("./commands/root.js");
    const workspace = resolveWorkspacePath();
    if (await shouldRunSetupBootstrapForRootShrimpy(workspace)) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("Shrimpy needs a usable coding model policy before opening the TUI. Run: shrimpy setup");
        process.exit(1);
      }

      const { runSetupEntry } = await import("./setup/service.js");
      const result = await runSetupEntry(workspace, { cwd: process.cwd() });
      process.exit(result.kind === "setup_started" ? 0 : 1);
    }
  }

  const { bootstrapInteractiveCompletion } = await import("./commands/completion-runtime.js");
  await bootstrapInteractiveCompletion();

  const { loadConfig } = await import("./config/index.js");
  const { createAppRuntime } = await import("./app/index.js");
  const {
    formatThinkingInputs,
    parseThinkingLevel,
  } = await import("./inference/thinking.js");
  const { runInteractiveAgentSession } = await import("./sessions/index.js");

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
    modelPolicy: values["model-policy"],
    thinking,
    skills: values.skill,
    initialMessage: prompt,
    cwd: process.cwd(),
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
