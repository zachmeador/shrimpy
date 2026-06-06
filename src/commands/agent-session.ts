import type { ShrimpyConfig } from "../config/index.js";
import { parseThinking } from "./agent-helpers.js";
import {
  type CommandResult,
  parseCommandArgs,
  requireArg,
} from "./framework.js";
import { cmdRun } from "./run.js";
import { createShrimpyTuiCommand } from "./tui.js";

export async function cmdAgentRun(
  config: ShrimpyConfig,
  args: string[],
  usage: string,
): Promise<CommandResult> {
  const agentId = requireArg(args[0], usage, "agent id");
  return cmdRun(["--agent", agentId, ...args.slice(1)], config);
}

export async function cmdAgentTui(
  config: ShrimpyConfig,
  args: string[],
  usage: string,
): Promise<CommandResult> {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      "model-policy": { type: "string" },
      thinking: { type: "string" },
      skill: { type: "string", short: "k", multiple: true },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");

  const prompt = positionals.slice(1).join(" ").trim() || undefined;
  return createShrimpyTuiCommand({
    agentId,
    channel: "tui",
    sessionType: "tui",
    provider: values.provider,
    model: values.model,
    modelPolicy: values["model-policy"],
    thinking: parseThinking(values.thinking),
    skills: values.skill,
    initialMessage: prompt,
    cwd: process.cwd(),
  });
}
