import { createAppRuntime } from "../app/index.js";
import {
  formatThinkingInputs,
  parseThinkingLevel,
} from "../inference/thinking.js";
import { runDirectAgentPrompt } from "../sessions/index.js";
import {
  parseCommandArgs,
  usage,
  type CommandHandler,
} from "./framework.js";

const USAGE = "usage: shrimpy run [--agent <id>] [--skill <id>] <prompt> [--provider <p>] [--model <m>] [--thinking <level>]";

export const cmdRun: CommandHandler = async (argv, config) => {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      thinking: { type: "string" },
      skill: { type: "string", short: "k", multiple: true },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });

  const prompt = positionals.join(" ").trim();
  const thinking = values.thinking === undefined
    ? undefined
    : parseThinkingLevel(values.thinking);
  if (!prompt) {
    usage(USAGE, "prompt required");
  }
  if (values.thinking !== undefined && thinking === undefined) {
    throw new Error(`thinking level must be one of: ${formatThinkingInputs()}`);
  }

  const runtime = createAppRuntime(config);
  const { output } = await runDirectAgentPrompt({
    runtime,
    agentId: values.agent,
    channel: "run",
    sessionType: "run",
    provider: values.provider,
    model: values.model,
    thinking,
    skills: values.skill,
    prompt,
    cwd: process.cwd(),
  });

  if (output) console.log(output);
  return 0;
};
