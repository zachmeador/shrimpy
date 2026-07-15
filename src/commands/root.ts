import { existsSync } from "node:fs";
import {
  primaryConfigPath,
  type ShrimpyConfig,
} from "../config/index.js";
import {
  isSetupReady,
  resolveSetupState,
} from "../setup/state.js";
import { resolveMostRecentInteractiveAgentId } from "../sessions/catalog.js";
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
import {
  MODEL_SESSION_OPTIONS,
  readModelSessionValues,
} from "./agent-helpers.js";

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
      ...MODEL_SESSION_OPTIONS,
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
  const sessionValues = readModelSessionValues(values);

  return createShrimpyTuiCommand({
    agentId: values.agent,
    session: { namespace: "local", name: "main" },
    purpose: "interactive",
    provider: sessionValues.provider,
    model: sessionValues.model,
    modelPolicy: sessionValues.modelPolicy,
    thinking: sessionValues.thinking,
    skills: sessionValues.skills,
    initialMessage: prompt,
  }, {
    beforeLaunch: bootstrapInteractiveCompletion,
    onboardingMode: "setup",
    ...(values.agent === undefined && prompt === undefined
      ? { resolveAgentId: resolveMostRecentInteractiveAgentId }
      : {}),
  });
};

export async function shouldRunSetupBootstrapForRootShrimpy(
  workspace: string,
): Promise<boolean> {
  const configPath = primaryConfigPath(workspace);
  if (!existsSync(configPath)) return true;

  return !isSetupReady(await resolveSetupState(workspace));
}
