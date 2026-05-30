import { createAppRuntime } from "../app/index.js";
import {
  executeSessionLifecycleAction,
  executeSessionThinkingAction,
  inspectSessionCompactionPolicy,
  summarizeAgentSessions,
} from "../sessions/index.js";
import {
  formatThinkingInputs,
  parseThinkingLevel,
} from "../inference/thinking.js";
import {
  printSessionLifecycleResult,
  printSessionListing,
  printSessionCompactionPolicy,
  printSessionThinkingResult,
} from "./sessions-format.js";
import {
  createCommandGroup,
  parseCommandArgs,
  requireArg,
  showUsage,
  usage,
  type CommandHandler,
  type CommandInvocation,
} from "./framework.js";

const USAGE = `usage:
  shrimpy sessions new <channel> [--agent <id>]
  shrimpy sessions clear <channel> [--agent <id>]
  shrimpy sessions restore <channel> [--agent <id>] [--archive <name>]
  shrimpy sessions thinking <channel> <level> [--agent <id>]
  shrimpy sessions list [channel] [--agent <id>] [--json]
  shrimpy sessions compaction <channel> [--agent <id>] [--session-type <type>] [--json]`;

function parseSessionArgs(argv: string[], usageText: string) {
  return parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      archive: { type: "string" },
      "session-type": { type: "string" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
    usage: usageText,
  });
}

async function inspectCompaction({ argv, config, usage: usageText }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseSessionArgs(argv, usageText);
  const channel = requireArg(positionals[0], usageText, "channel");
  const runtime = createAppRuntime(config);
  const summary = await inspectSessionCompactionPolicy(runtime, {
    agentId: values.agent,
    channel,
    sessionType: values["session-type"],
  });
  if (values.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printSessionCompactionPolicy(summary);
  }
  return 0;
}

async function listSessions({ argv, config, usage: usageText }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseSessionArgs(argv, usageText);
  const runtime = createAppRuntime(config);
  const channel = positionals[0];
  const summary = summarizeAgentSessions(runtime, {
    agentId: values.agent,
    channel,
  });
  if (values.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printSessionListing(summary);
  }
  return 0;
}

async function setThinking({ argv, config, usage: usageText }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseSessionArgs(argv, usageText);
  const channel = requireArg(positionals[0], usageText, "channel");
  const level = requireArg(positionals[1], usageText, "level");
  const parsedLevel = parseThinkingLevel(level);
  if (!parsedLevel) {
    usage(usageText, `thinking level must be one of: ${formatThinkingInputs()}`);
  }

  const runtime = createAppRuntime(config);
  const result = await executeSessionThinkingAction(runtime, {
    channel,
    level: parsedLevel,
    agentId: values.agent,
  });

  printSessionThinkingResult(result);
  return 0;
}

function sessionLifecycleAction(action: "new" | "clear" | "restore") {
  return ({ argv, config, usage: usageText }: CommandInvocation): number => {
    const { values, positionals } = parseSessionArgs(argv, usageText);
    const channel = requireArg(positionals[0], usageText, "channel");
    const runtime = createAppRuntime(config);

    const result = executeSessionLifecycleAction(runtime, {
      action,
      channel,
      agentId: values.agent,
      archive: values.archive,
    });

    printSessionLifecycleResult(result);
    return 0;
  };
}

export const cmdSessions: CommandHandler = createCommandGroup({
  name: "sessions",
  usage: USAGE,
  default: () => showUsage(USAGE),
  commands: {
    list: listSessions,
    compaction: inspectCompaction,
    thinking: setThinking,
    new: sessionLifecycleAction("new"),
    clear: sessionLifecycleAction("clear"),
    restore: sessionLifecycleAction("restore"),
  },
});
