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
} from "../thinking.js";
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
      "no-wait": { type: "boolean", default: false },
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
  const sessionId = requireArg(positionals[0], usageText, "session id");
  const runtime = createAppRuntime(config);
  const summary = await inspectSessionCompactionPolicy(runtime, {
    agentId: values.agent,
    sessionId,
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
  const sessionId = positionals[0];
  const summary = summarizeAgentSessions(runtime, {
    agentId: values.agent,
    sessionId,
  });
  const status = sessionId
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
  const sessionId = requireArg(positionals[0], usageText, "session id");
  const level = requireArg(positionals[1], usageText, "level");
  const parsedLevel = parseThinkingLevel(level);
  if (!parsedLevel) {
    usage(usageText, `thinking level must be one of: ${formatThinkingInputs()}`);
  }

  const runtime = createAppRuntime(config);
  const result = await executeSessionThinkingAction(runtime, {
    sessionId,
    level: parsedLevel,
    agentId: values.agent,
    wait: !values["no-wait"],
  });

  if (values.json) console.log(JSON.stringify(result, null, 2));
  else printSessionThinkingResult(result);
  return actionExitCode(result.outcome);
}

function sessionLifecycleAction(action: "new" | "clear" | "restore") {
  return async ({ argv, config, usage: usageText }: CommandInvocation): Promise<number> => {
    const { values, positionals } = parseSessionArgs(argv, usageText);
    const sessionId = requireArg(positionals[0], usageText, "session id");
    const runtime = createAppRuntime(config);

    const result = await executeSessionLifecycleAction(runtime, {
      action,
      sessionId,
      agentId: values.agent,
      archive: values.archive,
      wait: !values["no-wait"],
    });

    if (values.json) console.log(JSON.stringify(result, null, 2));
    else printSessionLifecycleResult(result);
    return actionExitCode(result.outcome);
  };
}

async function stopSession({ argv, config, usage: usageText }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseSessionArgs(argv, usageText);
  const sessionId = requireArg(positionals[0], usageText, "session id");
  const runtime = createAppRuntime(config);

  const result = await executeSessionStopAction(runtime, {
    sessionId,
    agentId: values.agent,
    wait: !values["no-wait"],
  });

  if (values.json) console.log(JSON.stringify(result, null, 2));
  else printSessionStopResult(result);
  return actionExitCode(result.outcome);
}

function actionExitCode(outcome: "applied" | "applied_direct" | "failed" | "unconfirmed" | "queued"): number {
  return outcome === "failed" || outcome === "unconfirmed" ? 1 : 0;
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
