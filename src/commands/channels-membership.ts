import type { AppRuntime } from "../app/index.js";
import {
  ensureChannelMembership,
  ensureDirectMessageChannel,
  formatChannelAgentIds,
  updateChannelMembership,
} from "../channels/service.js";
import { renderCommandUsage } from "./catalog.js";
import {
  parseCommandArgs,
  requireArg,
} from "./framework.js";

const CREATE_USAGE = renderCommandUsage(["channels", "create"]);
const DM_USAGE = renderCommandUsage(["channels", "dm"]);
const MEMBERS_USAGE = renderCommandUsage(["channels", "members"]);

function printMembership(channel: string, agents: string[]): void {
  console.log(`channel: ${channel}`);
  console.log(`agents: ${agents.length > 0 ? agents.join(", ") : "(none)"}`);
}

export async function cmdChannelsCreate(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const name = requireArg(args[0], CREATE_USAGE, "channel");

  const membership = ensureChannelMembership(runtime, name);
  if (json) {
    console.log(JSON.stringify({ channel: name, ...membership }, null, 2));
    return 0;
  }

  printMembership(name, formatChannelAgentIds(membership));
  return 0;
}

export async function cmdChannelsDm(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const agentA = requireArg(args[0], DM_USAGE, "agent-a");
  const agentB = requireArg(args[1], DM_USAGE, "agent-b");

  const { channel, membership } = ensureDirectMessageChannel(runtime, agentA, agentB);
  if (json) {
    console.log(JSON.stringify({ channel, ...membership }, null, 2));
    return 0;
  }

  printMembership(channel, formatChannelAgentIds(membership));
  return 0;
}

export async function cmdChannelsMembers(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const name = requireArg(args[0], MEMBERS_USAGE, "channel");

  const membership = ensureChannelMembership(runtime, name);
  if (json) {
    console.log(JSON.stringify({ channel: name, ...membership }, null, 2));
    return 0;
  }

  printMembership(name, formatChannelAgentIds(membership));
  return 0;
}

export async function cmdChannelsJoinOrLeave(
  runtime: AppRuntime,
  action: "join" | "leave",
  args: string[],
  json: boolean,
): Promise<number> {
  const usage = renderCommandUsage(["channels", action]);
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      agent: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const channel = requireArg(positionals[0], usage, "channel");
  const agentId = requireArg(values.agent, usage, "agent");

  const membership = updateChannelMembership(runtime, {
    action,
    channel,
    agentId,
  });

  if (json) {
    console.log(JSON.stringify({ channel, ...membership }, null, 2));
    return 0;
  }

  printMembership(channel, formatChannelAgentIds(membership));
  return 0;
}
