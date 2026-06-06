import { existsSync } from "node:fs";
import {
  primaryConfigPath,
  type ShrimpyConfig,
} from "../config/index.js";
import {
  formatThinkingInputs,
  parseThinkingLevel,
} from "../inference/thinking.js";
import {
  hasUsableCodingModelPolicyForWorkspace,
} from "../setup/readiness.js";
import { formatVersionLabel } from "../app/metadata.js";
import { brand } from "../util/style.js";
import { bootstrapInteractiveCompletion } from "./completion-runtime.js";
import {
  CommandError,
  parseCommandArgs,
  showUsage,
  type CommandHandler,
} from "./framework.js";
import { renderCliHelp } from "./help.js";
import { createShrimpyTuiCommand } from "./tui.js";

export const cmdRootTui: CommandHandler = async (
  rawArgs: string[],
  _config: ShrimpyConfig,
) => {
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
      throw new CommandError(
        `unknown command or help topic: ${positionals.join(" ")}\nRun "shrimpy --help" for default help, "shrimpy help all" for all commands, or use "--" before a prompt that should include help-like text.`,
      );
    }
    return showUsage(renderCliHelp());
  }

  if (values.version) {
    console.log(brand(formatVersionLabel()));
    return 0;
  }

  const prompt = positionals.length > 0 ? positionals.join(" ") : undefined;
  const thinking = values.thinking === undefined
    ? undefined
    : parseThinkingLevel(values.thinking);
  if (values.thinking !== undefined && thinking === undefined) {
    throw new Error(`thinking level must be one of: ${formatThinkingInputs()}`);
  }

  return createShrimpyTuiCommand({
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
};

export async function shouldRunSetupBootstrapForRootShrimpy(
  workspace: string,
): Promise<boolean> {
  const configPath = primaryConfigPath(workspace);
  if (!existsSync(configPath)) return true;

  return !(await hasUsableCodingModelPolicyForWorkspace(workspace));
}
