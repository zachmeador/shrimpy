import { createAppRuntime } from "../app/index.js";
import {
  executeSessionLifecycleAction,
  executeSessionStopAction,
  executeSessionThinkingAction,
  inspectSessionCompactionPolicy,
  readSessionAroundEntry,
  searchSessionTranscripts,
  summarizeAgentSessions,
  summarizeSessionStatus,
} from "../sessions/index.js";
import {
  formatThinkingInputs,
  parseThinkingLevel,
} from "../inference/thinking.js";
import {
  printSessionLifecycleResult,
  printSessionListing,
  printSessionCompactionPolicy,
  printSessionStopResult,
  printSessionReadResult,
  printSessionSearchResult,
  printSessionThinkingResult,
} from "./sessions-format.js";
import { parsePositiveInt } from "../util/parse.js";
import { renderGroupUsage } from "./catalog.js";
import {
  createCommandGroup,
  parseCommandArgs,
  requireArg,
  showUsage,
  usage,
  type CommandHandler,
  type CommandInvocation,
} from "./framework.js";

const USAGE = renderGroupUsage("sessions");

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

function parseSessionSearchArgs(argv: string[], usageText: string) {
  return parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      "all-agents": { type: "boolean", default: false },
      channel: { type: "string" },
      limit: { type: "string" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
    usage: usageText,
  });
}

function parseSessionReadArgs(argv: string[], usageText: string) {
  return parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      around: { type: "string" },
      window: { type: "string" },
      json: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
    usage: usageText,
  });
}

async function searchSessions({ argv, config, usage: usageText }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseSessionSearchArgs(argv, usageText);
  const query = positionals.join(" ").trim();
  requireArg(query, usageText, "query");
  const runtime = createAppRuntime(config);
  const result = await searchSessionTranscripts(runtime, {
    query,
    agentId: values.agent,
    channel: values.channel,
    allAgents: Boolean(values["all-agents"]),
    limit: values.limit ? parsePositiveInt(values.limit, "--limit") : undefined,
  });

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSessionSearchResult(result);
  }
  return 0;
}

async function readSession({ argv, config, usage: usageText }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseSessionReadArgs(argv, usageText);
  const session = requireArg(positionals[0], usageText, "session");
  const around = requireArg(values.around, usageText, "--around");
  const runtime = createAppRuntime(config);
  const result = await readSessionAroundEntry(runtime, {
    session,
    aroundEntryId: around,
    agentId: values.agent,
    window: values.window ? parsePositiveInt(values.window, "--window") : undefined,
  });

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSessionReadResult(result);
  }
  return 0;
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
  const status = channel
    ? undefined
    : summarizeSessionStatus(runtime, {
      agentId: values.agent,
      staleAfterMs: runtime.resolved.context.turn.sessionStatus.staleAfterMinutes * 60_000,
    });
  if (values.json) {
    console.log(JSON.stringify(status ? { ...summary, status } : summary, null, 2));
  } else {
    printSessionListing(summary, status);
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

function stopSession({ argv, config, usage: usageText }: CommandInvocation): number {
  const { values, positionals } = parseSessionArgs(argv, usageText);
  const channel = requireArg(positionals[0], usageText, "channel");
  const runtime = createAppRuntime(config);

  const result = executeSessionStopAction(runtime, {
    channel,
    agentId: values.agent,
  });

  printSessionStopResult(result);
  return 0;
}

export const cmdSessions: CommandHandler = createCommandGroup({
  name: "sessions",
  usage: USAGE,
  default: () => showUsage(USAGE),
  commands: {
    list: listSessions,
    search: searchSessions,
    read: readSession,
    compaction: inspectCompaction,
    thinking: setThinking,
    stop: stopSession,
    new: sessionLifecycleAction("new"),
    clear: sessionLifecycleAction("clear"),
    restore: sessionLifecycleAction("restore"),
  },
});
