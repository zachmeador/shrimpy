import type { AppRuntime } from "../../app/runtime.js";
import {
  formatTransportBinding,
  parseTransportBindingSpec,
  type ChannelManifest,
  type ChannelTransportBinding,
} from "../../channels/manifest.js";
import {
  channelAgentIds,
  ensureChannelMembership,
  ensureDirectMessageChannel,
  updateChannelMembership,
} from "../../channels/membership.js";
import { renderCommandUsage } from "../catalog.js";
import {
  parseCommandArgs,
  requireArg,
} from "../framework.js";

const CREATE_USAGE = renderCommandUsage(["channels", "create"]);
const DM_USAGE = renderCommandUsage(["channels", "dm"]);
const MEMBERS_USAGE = renderCommandUsage(["channels", "members"]);
const BIND_USAGE = renderCommandUsage(["channels", "bind"]);
const UNBIND_USAGE = renderCommandUsage(["channels", "unbind"]);

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

  const membership = ensureChannelMembership(runtime.createChannelMembershipStore(), name);
  if (json) {
    console.log(JSON.stringify({ channel: name, ...membership }, null, 2));
    return 0;
  }

  printMembership(name, channelAgentIds(membership));
  return 0;
}

export async function cmdChannelsDm(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const agentA = requireArg(args[0], DM_USAGE, "agent-a");
  const agentB = requireArg(args[1], DM_USAGE, "agent-b");
  runtime.getAgent(agentA);
  runtime.getAgent(agentB);

  const { channel, membership } = ensureDirectMessageChannel(
    runtime.createChannelMembershipStore(),
    agentA,
    agentB,
  );
  if (json) {
    console.log(JSON.stringify({ channel, ...membership }, null, 2));
    return 0;
  }

  printMembership(channel, channelAgentIds(membership));
  return 0;
}

export async function cmdChannelsMembers(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const name = requireArg(args[0], MEMBERS_USAGE, "channel");

  const membership = ensureChannelMembership(runtime.createChannelMembershipStore(), name);
  if (json) {
    console.log(JSON.stringify({ channel: name, ...membership }, null, 2));
    return 0;
  }

  printMembership(name, channelAgentIds(membership));
  return 0;
}

export async function cmdChannelsBind(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const channel = requireArg(args[0], BIND_USAGE, "channel");
  const binding = parseTransportBindingSpec(requireArg(args[1], BIND_USAGE, "binding"));
  const manifest = runtime.createChannelMembershipStore().bindChannel(channel, binding);
  printManifest(channel, manifest, json);
  return 0;
}

export async function cmdChannelsUnbind(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const channel = requireArg(args[0], UNBIND_USAGE, "channel");
  const manifest = runtime.createChannelMembershipStore().unbindChannel(channel);
  printManifest(channel, manifest, json);
  return 0;
}

function printManifest(
  channel: string,
  manifest: ChannelManifest,
  json: boolean,
): void {
  if (json) {
    console.log(JSON.stringify({ channel, manifest }, null, 2));
    return;
  }
  console.log(`channel: ${channel}`);
  console.log(`kind: ${manifest.kind}`);
  console.log(`binding: ${formatTransportBinding(manifest.binding as ChannelTransportBinding | undefined)}`);
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
  runtime.getAgent(agentId);

  const membership = updateChannelMembership(runtime.createChannelMembershipStore(), {
    action,
    channel,
    agentId,
  });

  if (json) {
    console.log(JSON.stringify({ channel, ...membership }, null, 2));
    return 0;
  }

  printMembership(channel, channelAgentIds(membership));
  return 0;
}
