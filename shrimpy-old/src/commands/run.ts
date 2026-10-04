import { createAppRuntime } from "../app/runtime.js";
import { parseSessionId } from "../sessions/identity.js";
import { runForegroundAgentPrompt } from "../sessions/foreground.js";
import {
  MODEL_SESSION_OPTIONS,
  readModelSessionValues,
} from "./agent/helpers.js";
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
      session: { type: "string", short: "s" },
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
  const agent = runtime.getAgent(values.agent);
  const requestedSession = values.session
    ? parseSessionId(agent.id, values.session)
    : undefined;
  const { output } = await runForegroundAgentPrompt({
    runtime,
    agentId: agent.id,
    session: requestedSession
      ? {
        namespace: requestedSession.namespace,
        name: requestedSession.name,
        profileId: requestedSession.profileId,
      }
      : { namespace: "local", name: "run" },
    purpose: "one-shot",
    persistent: requestedSession !== undefined,
    provider: sessionValues.provider,
    model: sessionValues.model,
    modelPolicy: sessionValues.modelPolicy,
    thinking: sessionValues.thinking,
    skills: sessionValues.skills,
    prompt,
  });

  if (output) console.log(output);
  return 0;
};
