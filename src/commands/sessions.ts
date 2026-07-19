import { createAppRuntime } from "../app/index.js";
import {
  executeSessionLifecycleAction,
  executeSessionSettingsAction,
  executeSessionStopAction,
  inspectSessionCompactionPolicy,
  readSessionAroundEntry,
  searchSessionTranscripts,
  summarizeAgentSessions,
  summarizeNavigableSessions,
  summarizeSessionStatus,
  type SessionControlDeps,
} from "../sessions/index.js";
import { parseModelRef } from "../config/model.js";
import { formatThinkingInputs, parseThinkingLevel } from "../thinking.js";
import {
  printSessionLifecycleResult,
  printSessionListing,
  printNavigableSessionInventory,
  printSessionCompactionPolicy,
  printSessionStopResult,
  printSessionReadResult,
  printSessionSearchResult,
  printSessionSettingsResult,
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

function parseSessionListArgs(argv: string[], usageText: string) {
  return parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      "all-agents": { type: "boolean", default: false },
      json: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
    usage: usageText,
  });
}

function parseSessionSetArgs(argv: string[], usageText: string) {
  return parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      thinking: { type: "string" },
      model: { type: "string", short: "m" },
      "model-policy": { type: "string" },
      "no-wait": { type: "boolean", default: false },
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
  const { values, positionals } = parseSessionListArgs(argv, usageText);
  if (values.agent && values["all-agents"]) {
    usage(usageText, "--agent and --all-agents cannot be used together");
  }
  if (values["all-agents"] && positionals[0]) {
    usage(usageText, "a session id cannot be combined with --all-agents");
  }
  const runtime = createAppRuntime(config);
  if (values["all-agents"]) {
    const inventory = summarizeNavigableSessions(runtime);
    if (values.json) console.log(JSON.stringify(inventory, null, 2));
    else printNavigableSessionInventory(inventory);
    return 0;
  }
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

async function setSession(
  { argv, config, usage: usageText }: CommandInvocation,
  controlDeps: SessionControlDeps = {},
): Promise<number> {
  const { values, positionals } = parseSessionSetArgs(argv, usageText);
  const sessionId = requireArg(positionals[0], usageText, "session id");
  if (positionals.length > 1) usage(usageText, `unexpected argument: ${positionals[1]}`);
  if (values.model && values["model-policy"]) {
    usage(usageText, "--model and --model-policy are mutually exclusive");
  }
  if (!values.thinking && !values.model && !values["model-policy"]) {
    usage(usageText, "provide --thinking, --model, or --model-policy");
  }
  const thinking = values.thinking ? parseThinkingLevel(values.thinking) : undefined;
  if (values.thinking && !thinking) {
    usage(usageText, `thinking level must be one of: ${formatThinkingInputs()}`);
  }

  const runtime = createAppRuntime(config);
  const result = await executeSessionSettingsAction(runtime, {
    sessionId,
    thinking,
    model: values.model ? parseModelRef(values.model, "--model") : undefined,
    modelPolicy: values["model-policy"],
    agentId: values.agent,
    wait: !values["no-wait"],
  }, controlDeps);

  if (values.json) console.log(JSON.stringify(result, null, 2));
  else printSessionSettingsResult(result);
  return actionExitCode(result.outcome);
}

function sessionLifecycleAction(
  action: "new" | "clear" | "restore",
  controlDeps: SessionControlDeps = {},
) {
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
    }, controlDeps);

    if (values.json) console.log(JSON.stringify(result, null, 2));
    else printSessionLifecycleResult(result);
    return actionExitCode(result.outcome);
  };
}

async function stopSession(
  { argv, config, usage: usageText }: CommandInvocation,
  controlDeps: SessionControlDeps = {},
): Promise<number> {
  const { values, positionals } = parseSessionArgs(argv, usageText);
  const sessionId = requireArg(positionals[0], usageText, "session id");
  const runtime = createAppRuntime(config);

  const result = await executeSessionStopAction(runtime, {
    sessionId,
    agentId: values.agent,
    wait: !values["no-wait"],
  }, controlDeps);

  if (values.json) console.log(JSON.stringify(result, null, 2));
  else printSessionStopResult(result);
  return actionExitCode(result.outcome);
}

function actionExitCode(outcome: "applied" | "applied_direct" | "failed" | "unconfirmed" | "queued"): number {
  return outcome === "failed" || outcome === "unconfirmed" ? 1 : 0;
}

export function createSessionsCommand(
  controlDeps: SessionControlDeps = {},
): CommandHandler {
  return createCommandGroup({
    name: "sessions",
    usage: USAGE,
    default: () => showUsage(USAGE),
    commands: {
      list: listSessions,
      search: searchSessions,
      read: readSession,
      compaction: inspectCompaction,
      set: (invocation) => setSession(invocation, controlDeps),
      stop: (invocation) => stopSession(invocation, controlDeps),
      new: sessionLifecycleAction("new", controlDeps),
      clear: sessionLifecycleAction("clear", controlDeps),
      restore: sessionLifecycleAction("restore", controlDeps),
    },
  });
}

export const cmdSessions: CommandHandler = createSessionsCommand();
