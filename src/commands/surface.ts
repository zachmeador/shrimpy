import { createAppRuntime } from "../app/index.js";
import type { ShrimpyConfig } from "../config/index.js";
import { renderGroupUsage } from "./catalog.js";
import {
  createCommandGroup,
  requireArg,
  stripFlag,
  type CommandHandler,
  type CommandInvocation,
} from "./framework.js";

const USAGE = renderGroupUsage("surface");

function createSurfaceCommand(json: boolean): CommandHandler {
  return createCommandGroup({
    name: "surface",
    usage: USAGE,
    default: ({ config }) => listSurfaceState(config, json),
    commands: {
      show: (invocation) => showSurfaceState(invocation),
      "set-agent": (invocation) => setSurfaceAgent(invocation, json),
      "clear-agent": (invocation) => clearSurfaceAgent(invocation, json),
    },
  });
}

export const cmdSurface: CommandHandler = async (argv, config) => {
  const stripped = stripFlag(argv, "--json");
  return createSurfaceCommand(stripped.present)(stripped.argv, config);
};

async function listSurfaceState(
  config: ShrimpyConfig,
  json: boolean,
): Promise<number> {
  const runtime = createAppRuntime(config);
  const store = runtime.createSurfaceThreadStateStore();

  const entries = store.list();
  if (json) {
    console.log(JSON.stringify(entries, null, 2));
    return 0;
  }
  if (entries.length === 0) {
    console.log("(no surface thread state)");
    return 0;
  }

  for (const entry of entries) {
    console.log(
      `${entry.surface} ${entry.threadId}  addressed_agent=${entry.addressedAgentId ?? "(none)"}`,
    );
  }
  return 0;
}

async function showSurfaceState({ argv, config, usage }: CommandInvocation): Promise<number> {
  const runtime = createAppRuntime(config);
  const store = runtime.createSurfaceThreadStateStore();
  const surface = requireArg(argv[0], usage, "surface");
  const threadId = requireArg(argv[1], usage, "thread id");

  const state = store.get(surface, threadId);
  console.log(JSON.stringify({
    surface,
    threadId,
    addressedAgentId: state.addressedAgentId ?? null,
  }, null, 2));
  return 0;
}

async function setSurfaceAgent(
  { argv, config, usage }: CommandInvocation,
  json: boolean,
): Promise<number> {
  const runtime = createAppRuntime(config);
  const store = runtime.createSurfaceThreadStateStore();
  const surface = requireArg(argv[0], usage, "surface");
  const threadId = requireArg(argv[1], usage, "thread id");
  const agentId = requireArg(argv[2], usage, "agent id");

  runtime.getAgent(agentId);
  store.setAddressedAgent(surface, threadId, agentId);
  if (json) {
    console.log(JSON.stringify({
      surface,
      threadId,
      addressedAgentId: agentId,
    }, null, 2));
    return 0;
  }
  console.log(`set addressed agent for ${surface}:${threadId} -> ${agentId}`);
  return 0;
}

async function clearSurfaceAgent(
  { argv, config, usage }: CommandInvocation,
  json: boolean,
): Promise<number> {
  const runtime = createAppRuntime(config);
  const store = runtime.createSurfaceThreadStateStore();
  const surface = requireArg(argv[0], usage, "surface");
  const threadId = requireArg(argv[1], usage, "thread id");

  store.clearAddressedAgent(surface, threadId);
  if (json) {
    console.log(JSON.stringify({
      surface,
      threadId,
      addressedAgentId: null,
    }, null, 2));
    return 0;
  }
  console.log(`cleared addressed agent for ${surface}:${threadId}`);
  return 0;
}
