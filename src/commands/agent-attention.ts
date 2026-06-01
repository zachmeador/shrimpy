import {
  type AttentionField,
  type AttentionRuleValues,
  type AttentionSenderKind,
} from "../agents/attention-edit.js";
import {
  explainAgentMessageHandling,
  extractMentionedAgentIds,
} from "../agents/channel-policy.js";
import { editAgentAttention } from "../agents/service.js";
import type { EditAgentAttentionResult } from "../agents/workspace-manager.js";
import { createAppRuntime } from "../app/index.js";
import {
  makeMessage,
  textContent,
  type MessageSenderKind,
} from "../channels/index.js";
import { resolveAgentAttentionForChannel } from "../config/agents.js";
import type { ShrimpyConfig } from "../config/index.js";
import { channelMatches } from "../util/channel-pattern.js";
import {
  parseAttentionMode,
  parseCsv,
} from "./agent-helpers.js";
import {
  parseCommandArgs,
  printError,
  requireArg,
} from "./framework.js";

function parseSenderKind(value?: string): MessageSenderKind {
  if (value === "human" || value === "agent" || value === "system") return value;
  throw new Error("sender must be one of: human, agent, system");
}

function parseSenderKinds(value: string): AttentionSenderKind[] {
  const items = parseCsv(value);
  if (!items) {
    throw new Error("senders must list at least one of: human, agent, system");
  }
  return items.map((item) => parseSenderKind(item));
}

function requireIds(value: string, label: string): string[] {
  const items = parseCsv(value);
  if (!items) {
    throw new Error(`${label} must list at least one id`);
  }
  return items;
}

function parseChannelTarget(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function reportAttentionEdit(
  action: "set" | "clear",
  agentId: string,
  channel: string | undefined,
  result: EditAgentAttentionResult,
  json: boolean,
): number {
  const target = channel ? `channel:${channel}` : "base";
  if (json) {
    console.log(JSON.stringify({
      action,
      agentId,
      target,
      configPath: result.configPath,
      previousAttention: result.previousAttention ?? null,
      attention: result.nextAttention,
    }, null, 2));
    return 0;
  }

  console.log(`attention ${action}: ${agentId}`);
  console.log(`target: ${target}`);
  console.log(`config: ${result.configPath}`);
  console.log(
    `attention: ${result.nextAttention ? JSON.stringify(result.nextAttention) : "(default)"}`,
  );
  return 0;
}

function parseAddressed(value?: string): string | undefined {
  if (value === undefined || value === "" || value === "none") return undefined;
  return value;
}

export async function cmdAgentAttention(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  if (args[0] === "test") {
    return cmdAgentAttentionTest(config, args.slice(1), json, usage);
  }
  if (args[0] === "set") {
    return cmdAgentAttentionSet(config, args.slice(1), json, usage);
  }
  if (args[0] === "clear") {
    return cmdAgentAttentionClear(config, args.slice(1), json, usage);
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
    ? Object.keys(agent.attention.channels)
      .filter((pattern) => channelMatches(pattern, values.channel!))
    : [];
  const effective = values.channel
    ? resolveAgentAttentionForChannel(agent.attention, values.channel)
    : undefined;

  const view = {
    agentId: agent.id,
    attention: agent.attention,
    ...(values.channel
      ? {
        channel: values.channel,
        matchedChannelOverrides,
        effectiveAttention: effective,
      }
      : {}),
    impliedPolicies: [
      "origin.addressedAgentId routes only to that agent",
      "human single-agent @agent mentions call that agent even when ambient attention is quiet",
      "agents do not handle their own channel messages",
    ],
  };

  if (json) {
    console.log(JSON.stringify(view, null, 2));
    return 0;
  }

  console.log(`agent: ${agent.id}`);
  console.log(`base_mode: ${agent.attention.mode}`);
  console.log(`base_senders: ${agent.attention.senders.join(",") || "(any)"}`);
  console.log(`base_actor_ids: ${agent.attention.actorIds.join(",") || "(any)"}`);
  console.log(`base_user_ids: ${agent.attention.userIds.join(",") || "(any)"}`);
  if (values.channel && effective) {
    console.log(`channel: ${values.channel}`);
    console.log(`matched_overrides: ${matchedChannelOverrides.join(",") || "(none)"}`);
    console.log(`effective_mode: ${effective.mode}`);
    console.log(`effective_senders: ${effective.senders.join(",") || "(any)"}`);
    console.log(`effective_actor_ids: ${effective.actorIds.join(",") || "(any)"}`);
    console.log(`effective_user_ids: ${effective.userIds.join(",") || "(any)"}`);
  } else {
    const patterns = Object.keys(agent.attention.channels);
    console.log(`channel_overrides: ${patterns.join(",") || "(none)"}`);
  }
  console.log("implied_policies:");
  for (const policy of view.impliedPolicies) {
    console.log(`- ${policy}`);
  }
  return 0;
}

async function cmdAgentAttentionSet(
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
    return printError("agent attention set --channel requires a non-empty pattern");
  }

  const set: AttentionRuleValues = {};
  if (values.mode !== undefined) {
    const mode = parseAttentionMode(values.mode);
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
      "agent attention set requires at least one of --mode, --senders, --actor-ids, --user-ids",
    );
  }

  const runtime = createAppRuntime(config);
  const result = editAgentAttention(runtime, {
    agentId,
    edit: { ...(channel ? { channel } : {}), set },
  });
  return reportAttentionEdit("set", agentId, channel ?? undefined, result, json);
}

async function cmdAgentAttentionClear(
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
    return printError("agent attention clear --channel requires a non-empty pattern");
  }

  const clear: AttentionField[] = [];
  if (values.mode) clear.push("mode");
  if (values.senders) clear.push("senders");
  if (values["actor-ids"]) clear.push("actorIds");
  if (values["user-ids"]) clear.push("userIds");

  const removeChannel = channel !== undefined && clear.length === 0;
  if (clear.length === 0 && !removeChannel) {
    return printError(
      "agent attention clear requires --channel or at least one of --mode, --senders, --actor-ids, --user-ids",
    );
  }

  const runtime = createAppRuntime(config);
  const result = editAgentAttention(runtime, {
    agentId,
    edit: {
      ...(channel ? { channel } : {}),
      ...(clear.length > 0 ? { clear } : {}),
      ...(removeChannel ? { removeChannel: true } : {}),
    },
  });
  return reportAttentionEdit("clear", agentId, channel ?? undefined, result, json);
}

async function cmdAgentAttentionTest(
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
  const actorId = values["actor-id"] ?? `${senderKind}:attention-test`;
  const message = makeMessage({
    id: "attention-test",
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
  const explanation = explainAgentMessageHandling(agent, channel, message);
  const matchedChannelOverrides = Object.keys(agent.attention.channels)
    .filter((pattern) => channelMatches(pattern, channel));

  const view = {
    agentId: agent.id,
    channel,
    handles: explanation.handles,
    reason: explanation.reason,
    impliedRule: explanation.impliedRule,
    matchedChannelOverrides,
    effectiveAttention: explanation.effectiveAttention
      ?? resolveAgentAttentionForChannel(agent.attention, channel),
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
  console.log(`sender: ${view.message.sender.kind}`);
  console.log(`actor_id: ${view.message.sender.actorId}`);
  if (view.message.sender.userId) {
    console.log(`user_id: ${view.message.sender.userId}`);
  }
  console.log(`handles: ${view.handles}`);
  console.log(`reason: ${view.reason}`);
  if (view.impliedRule) {
    console.log(`implied_rule: ${view.impliedRule}`);
  }
  console.log(`matched_overrides: ${matchedChannelOverrides.join(",") || "(none)"}`);
  console.log(`effective_mode: ${view.effectiveAttention.mode}`);
  console.log(`effective_senders: ${view.effectiveAttention.senders.join(",") || "(any)"}`);
  console.log(`effective_actor_ids: ${view.effectiveAttention.actorIds.join(",") || "(any)"}`);
  console.log(`effective_user_ids: ${view.effectiveAttention.userIds.join(",") || "(any)"}`);
  console.log(`mentions: ${view.message.mentionedAgentIds.join(",") || "(none)"}`);
  return 0;
}
