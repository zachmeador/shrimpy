import {
  type ChannelPolicyField,
  type ChannelPolicyRuleValues,
  type ChannelPolicySenderKind,
} from "../../agents/channel-policy-edit.js";
import { evaluateAgentChannelPolicy, extractMentionedAgentIds } from "../../agents/channel-policy.js";
import { editAgentChannelPolicy } from "../../agents/operations.js";
import type { EditAgentChannelPolicyResult } from "../../agents/operations.js";
import { createAppRuntime } from "../../app/runtime.js";
import { makeMessage, type MessageSenderKind } from "../../channels/protocol.js";
import { textContent } from "../../channels/messages.js";
import { channelAgentIds } from "../../channels/membership.js";
import {
  resolveAgentChannelPolicyForChannel,
} from "../../config/agents.js";
import type { ShrimpyConfig } from "../../config/load.js";
import { channelMatches } from "../../util/channel-pattern.js";
import {
  parseChannelPolicyMode,
  parseCsv,
} from "./helpers.js";
import {
  parseCommandArgs,
  printError,
  requireArg,
} from "../framework.js";

function parseSenderKind(value?: string): MessageSenderKind {
  if (value === "human" || value === "agent" || value === "system") return value;
  throw new Error("sender must be one of: human, agent, system");
}

function parseSenderKinds(value: string): ChannelPolicySenderKind[] {
  const items = parseCsv(value);
  if (!items) {
    throw new Error("senders must list at least one of: human, agent, system");
  }
  return items.map((item) => parseSenderKind(item));
}

function requireIds(value: string, label: string): string[] {
  const items = parseCsv(value);
  if (!items) throw new Error(`${label} must list at least one id`);
  return items;
}

function parseChannelTarget(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseAddressed(value?: string): string | undefined {
  if (value === undefined || value === "" || value === "none") return undefined;
  return value;
}

function reportChannelPolicyEdit(
  action: "set" | "clear",
  agentId: string,
  channel: string | undefined,
  result: EditAgentChannelPolicyResult,
  json: boolean,
): number {
  const target = channel ? `channel:${channel}` : "base";
  if (json) {
    console.log(JSON.stringify({
      action,
      agentId,
      target,
      configPath: result.configPath,
      previousChannelPolicy: result.previousChannelPolicy ?? null,
      channelPolicy: result.nextChannelPolicy,
    }, null, 2));
    return 0;
  }

  console.log(`channel_policy ${action}: ${agentId}`);
  console.log(`target: ${target}`);
  console.log(`config: ${result.configPath}`);
  console.log(
    `channel_policy: ${result.nextChannelPolicy ? JSON.stringify(result.nextChannelPolicy) : "(default)"}`,
  );
  return 0;
}

export async function cmdAgentChannelPolicy(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  if (args[0] === "explain") {
    return cmdAgentChannelPolicyExplain(config, args.slice(1), json, usage);
  }
  if (args[0] === "set") {
    return cmdAgentChannelPolicySet(config, args.slice(1), json, usage);
  }
  if (args[0] === "clear") {
    return cmdAgentChannelPolicyClear(config, args.slice(1), json, usage);
  }

  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      channel: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");
  const runtime = createAppRuntime(config);
  const agent = runtime.getAgent(agentId);
  const matchedChannelOverrides = values.channel
    ? Object.keys(agent.channelPolicy.channels)
      .filter((pattern) => channelMatches(pattern, values.channel!))
    : [];
  const effective = values.channel
    ? resolveAgentChannelPolicyForChannel(agent.channelPolicy, values.channel)
    : undefined;
  const membership = values.channel
    ? runtime.createChannelMembershipStore().seedChannel(values.channel)
    : undefined;
  const memberAgentIds = membership ? channelAgentIds(membership) : undefined;

  const view = {
    agentId: agent.id,
    channelPolicy: agent.channelPolicy,
    ...(values.channel
      ? {
        channel: values.channel,
        visible: memberAgentIds?.includes(agent.id) ?? false,
        memberAgentIds,
        matchedChannelOverrides,
        effectiveChannelPolicy: effective,
      }
      : {}),
    policyOwner: "agent",
  };

  if (json) {
    console.log(JSON.stringify(view, null, 2));
    return 0;
  }

  console.log(`agent: ${agent.id}`);
  console.log(`policy_owner: agent`);
  console.log(`base_mode: ${agent.channelPolicy.mode}`);
  console.log(`base_senders: ${agent.channelPolicy.senders.join(",") || "(any)"}`);
  console.log(`base_actor_ids: ${agent.channelPolicy.actorIds.join(",") || "(any)"}`);
  console.log(`base_user_ids: ${agent.channelPolicy.userIds.join(",") || "(any)"}`);
  if (values.channel && effective) {
    console.log(`channel: ${values.channel}`);
    console.log(`visible: ${view.visible}`);
    console.log(`members: ${memberAgentIds?.join(",") || "(none)"}`);
    console.log(`matched_overrides: ${matchedChannelOverrides.join(",") || "(none)"}`);
    console.log(`effective_mode: ${effective.mode}`);
    console.log(`effective_senders: ${effective.senders.join(",") || "(any)"}`);
    console.log(`effective_actor_ids: ${effective.actorIds.join(",") || "(any)"}`);
    console.log(`effective_user_ids: ${effective.userIds.join(",") || "(any)"}`);
  } else {
    const patterns = Object.keys(agent.channelPolicy.channels);
    console.log(`channel_overrides: ${patterns.join(",") || "(none)"}`);
  }
  return 0;
}

async function cmdAgentChannelPolicySet(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      channel: { type: "string" },
      mode: { type: "string" },
      senders: { type: "string" },
      "actor-ids": { type: "string" },
      "user-ids": { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");
  const channel = parseChannelTarget(values.channel);
  if (channel === null) {
    return printError("agent channel-policy set --channel requires a non-empty pattern");
  }

  const set: ChannelPolicyRuleValues = {};
  if (values.mode !== undefined) {
    const mode = parseChannelPolicyMode(values.mode);
    if (mode) set.mode = mode;
  }
  if (values.senders !== undefined) set.senders = parseSenderKinds(values.senders);
  if (values["actor-ids"] !== undefined) {
    set.actorIds = requireIds(values["actor-ids"], "actor-ids");
  }
  if (values["user-ids"] !== undefined) {
    set.userIds = requireIds(values["user-ids"], "user-ids");
  }

  if (Object.keys(set).length === 0) {
    return printError(
      "agent channel-policy set requires at least one of --mode, --senders, --actor-ids, --user-ids",
    );
  }

  const runtime = createAppRuntime(config);
  const result = editAgentChannelPolicy(runtime, {
    agentId,
    edit: { ...(channel ? { channel } : {}), set },
  });
  return reportChannelPolicyEdit("set", agentId, channel ?? undefined, result, json);
}

async function cmdAgentChannelPolicyClear(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      channel: { type: "string" },
      mode: { type: "boolean" },
      senders: { type: "boolean" },
      "actor-ids": { type: "boolean" },
      "user-ids": { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");
  const channel = parseChannelTarget(values.channel);
  if (channel === null) {
    return printError("agent channel-policy clear --channel requires a non-empty pattern");
  }

  const clear: ChannelPolicyField[] = [];
  if (values.mode) clear.push("mode");
  if (values.senders) clear.push("senders");
  if (values["actor-ids"]) clear.push("actorIds");
  if (values["user-ids"]) clear.push("userIds");

  const removeChannel = channel !== undefined && clear.length === 0;
  if (clear.length === 0 && !removeChannel) {
    return printError(
      "agent channel-policy clear requires --channel or at least one of --mode, --senders, --actor-ids, --user-ids",
    );
  }

  const runtime = createAppRuntime(config);
  const result = editAgentChannelPolicy(runtime, {
    agentId,
    edit: {
      ...(channel ? { channel } : {}),
      ...(clear.length > 0 ? { clear } : {}),
      ...(removeChannel ? { removeChannel: true } : {}),
    },
  });
  return reportChannelPolicyEdit("clear", agentId, channel ?? undefined, result, json);
}

async function cmdAgentChannelPolicyExplain(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      channel: { type: "string" },
      sender: { type: "string" },
      text: { type: "string" },
      addressed: { type: "string" },
      "actor-id": { type: "string" },
      "user-id": { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");
  const channel = requireArg(values.channel, usage, "channel");
  const sender = requireArg(values.sender, usage, "sender");
  const text = requireArg(values.text, usage, "text");
  const runtime = createAppRuntime(config);
  const agent = runtime.getAgent(agentId);
  const senderKind = parseSenderKind(sender);
  const actorId = values["actor-id"] ?? `${senderKind}:channel-policy-explain`;
  const message = makeMessage({
    id: "channel-policy-explain",
    timestamp: 0,
    sender: {
      kind: senderKind,
      actorId,
      ...(values["user-id"] ? { userId: values["user-id"] } : {}),
    },
    origin: {
      transport: "cli",
      sourceChannel: channel,
      addressedAgentId: parseAddressed(values.addressed),
    },
    content: textContent(text),
  });
  const membership = runtime.createChannelMembershipStore().seedChannel(channel);
  const memberAgentIds = channelAgentIds(membership);
  const decision = evaluateAgentChannelPolicy(agent, channel, message, {
    visible: memberAgentIds.includes(agent.id),
  });
  const view = {
    ...decision,
    memberAgentIds,
    message: {
      sender: message.sender,
      origin: message.origin,
      text,
      mentionedAgentIds: extractMentionedAgentIds(message),
    },
  };

  if (json) {
    console.log(JSON.stringify(view, null, 2));
    return 0;
  }

  console.log(`agent: ${view.agentId}`);
  console.log(`channel: ${view.channel}`);
  console.log(`visible: ${view.visible}`);
  console.log(`action: ${view.action}`);
  console.log(`reason: ${view.reason}`);
  console.log(`policy_owner: ${view.policyOwner}`);
  if (view.runtimeGuard) console.log(`runtime_guard: ${view.runtimeGuard}`);
  console.log(`sender: ${view.message.sender.kind}`);
  console.log(`actor_id: ${view.message.sender.actorId}`);
  if (view.message.sender.userId) {
    console.log(`user_id: ${view.message.sender.userId}`);
  }
  if (view.addressedAgentId) console.log(`addressed: ${view.addressedAgentId}`);
  console.log(`mentions: ${view.message.mentionedAgentIds.join(",") || "(none)"}`);
  console.log(`members: ${view.memberAgentIds.join(",") || "(none)"}`);
  if (view.effectivePolicy) {
    console.log(`effective_mode: ${view.effectivePolicy.mode}`);
    console.log(`effective_senders: ${view.effectivePolicy.senders.join(",") || "(any)"}`);
    console.log(`effective_actor_ids: ${view.effectivePolicy.actorIds.join(",") || "(any)"}`);
    console.log(`effective_user_ids: ${view.effectivePolicy.userIds.join(",") || "(any)"}`);
  }
  return 0;
}
