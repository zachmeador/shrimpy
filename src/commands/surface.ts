import { createAppRuntime } from "../app/runtime.js";
import type { ShrimpyConfig } from "../config/load.js";
import {
  ensureSurfaceChannelMember,
  publishSurfaceAddressingChange,
  resolveSurfaceThreadChannel,
} from "../surfaces/shared/addressing.js";
import { renderGroupUsage } from "./catalog.js";
import {
  createCommandGroup,
  parseCommandArgs,
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
      activity: (invocation) => startSurfaceActivity(invocation, json),
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
  const previousAgentId = store.get(surface, threadId).addressedAgentId;
  const channel = resolveSurfaceThreadChannel(surface, threadId);
  const joined = channel
    ? ensureSurfaceChannelMember({
      memberships: runtime.createChannelMembershipStore(),
      channel,
      agentId,
    })
    : false;
  store.setAddressedAgent(surface, threadId, agentId);
  if (channel) {
    publishSurfaceAddressingChange(runtime.createChannelBus(), {
      surface,
      threadId,
      channel,
      previousAgentId,
      addressedAgentId: agentId,
      joinedAgentId: joined ? agentId : undefined,
      source: "cli",
    });
  }
  if (json) {
    console.log(JSON.stringify({
      surface,
      threadId,
      addressedAgentId: agentId,
      channel,
      joinedAgentId: joined ? agentId : null,
    }, null, 2));
    return 0;
  }
  console.log(
    `set addressed agent for ${surface}:${threadId} -> ${agentId}`
    + (joined ? " (joined channel)" : ""),
  );
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
  const previousAgentId = store.get(surface, threadId).addressedAgentId;
  const channel = resolveSurfaceThreadChannel(surface, threadId);

  store.clearAddressedAgent(surface, threadId);
  if (channel) {
    publishSurfaceAddressingChange(runtime.createChannelBus(), {
      surface,
      threadId,
      channel,
      previousAgentId,
      source: "cli",
    });
  }
  if (json) {
    console.log(JSON.stringify({
      surface,
      threadId,
      addressedAgentId: null,
      channel,
    }, null, 2));
    return 0;
  }
  console.log(`cleared addressed agent for ${surface}:${threadId}`);
  return 0;
}

async function startSurfaceActivity(
  { argv, config, usage }: CommandInvocation,
  json: boolean,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      kind: { type: "string", default: "typing" },
      duration: { type: "string", default: "5" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const channel = requireArg(positionals[0], usage, "channel");
  const kind = values.kind;
  if (kind !== "typing") {
    throw new Error(`unsupported activity kind: ${kind}`);
  }
  const durationSeconds = parseDurationSeconds(values.duration);

  const runtime = createAppRuntime(config);
  const egressRegistry = runtime.createCliEgressRegistry();
  const channelBus = runtime.createChannelBus({ egressRegistry });
  const handle = await channelBus.startActivity({ channel, kind });

  if (!handle) {
    if (json) {
      console.log(JSON.stringify({
        channel,
        kind,
        started: false,
        durationSeconds,
      }, null, 2));
      return 0;
    }
    console.log(`no surface activity route for ${channel}`);
    return 0;
  }

  try {
    await sleep(durationSeconds * 1000);
  } finally {
    await handle.stop();
  }

  if (json) {
    console.log(JSON.stringify({
      channel,
      kind,
      started: true,
      durationSeconds,
    }, null, 2));
    return 0;
  }
  console.log(`sent ${kind} activity for ${channel} (${durationSeconds}s)`);
  return 0;
}

function parseDurationSeconds(raw: string | undefined): number {
  const value = Number(raw ?? "5");
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("--duration must be a non-negative number of seconds");
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
