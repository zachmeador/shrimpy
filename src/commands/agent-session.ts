import type { ShrimpyConfig } from "../config/index.js";
import {
  MODEL_SESSION_OPTIONS,
  readModelSessionValues,
} from "./agent-helpers.js";
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
      ...MODEL_SESSION_OPTIONS,
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");

  const prompt = positionals.slice(1).join(" ").trim() || undefined;
  const sessionValues = readModelSessionValues(values);
  return createShrimpyTuiCommand({
    agentId,
    channel: "tui",
    sessionType: "tui",
    provider: sessionValues.provider,
    model: sessionValues.model,
    modelPolicy: sessionValues.modelPolicy,
    thinking: sessionValues.thinking,
    skills: sessionValues.skills,
    initialMessage: prompt,
    cwd: process.cwd(),
  });
}
