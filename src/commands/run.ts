import { createAppRuntime } from "../app/index.js";
import { runDirectAgentPrompt } from "../sessions/index.js";
import {
  MODEL_SESSION_OPTIONS,
  readModelSessionValues,
} from "./agent-helpers.js";
import {
  parseCommandArgs,
  usage,
  type CommandHandler,
} from "./framework.js";
import { renderCommandUsage } from "./catalog.js";

const USAGE = renderCommandUsage(["run"]);

export const cmdRun: CommandHandler = async (argv, config) => {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      ...MODEL_SESSION_OPTIONS,
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });

  const prompt = positionals.join(" ").trim();
  if (!prompt) {
    usage(USAGE, "prompt required");
  }
  const sessionValues = readModelSessionValues(values);

  const runtime = createAppRuntime(config);
  const { output } = await runDirectAgentPrompt({
    runtime,
    agentId: values.agent,
    channel: "run",
    sessionType: "run",
    provider: sessionValues.provider,
    model: sessionValues.model,
    modelPolicy: sessionValues.modelPolicy,
    thinking: sessionValues.thinking,
    skills: sessionValues.skills,
    prompt,
    cwd: process.cwd(),
  });

  if (output) console.log(output);
  return 0;
};
