import type { ChannelMessage, MessageSenderKind } from "../channels/index.js";
import {
  resolveAgentChannelPolicyForChannel,
  type AgentChannelPolicyRule,
  type ResolvedAgentConfig,
} from "../config/agents.js";

type AgentChannelPolicyAction = "wake" | "ignore";

interface AgentChannelPolicyDecision {
  agentId: string;
  channel: string;
  visible: boolean;
  action: AgentChannelPolicyAction;
  reason: string;
  policyOwner: "agent";
  effectivePolicy?: Required<AgentChannelPolicyRule>;
  runtimeGuard?: string;
  addressedAgentId?: string;
  mentionedAgentIds: string[];
}

interface EvaluateAgentChannelPolicyOpts {
  visible: boolean;
}

export function evaluateAgentChannelPolicy(
  agent: Pick<ResolvedAgentConfig, "id" | "channelPolicy">,
  channel: string,
  message: ChannelMessage,
  opts: EvaluateAgentChannelPolicyOpts,
): AgentChannelPolicyDecision {
  const mentionedAgentIds = extractMentionedAgentIds(message);
  const base = {
    agentId: agent.id,
    channel,
    visible: opts.visible,
    policyOwner: "agent" as const,
    ...(message.origin.addressedAgentId
      ? { addressedAgentId: message.origin.addressedAgentId }
      : {}),
    mentionedAgentIds,
  };

  if (!opts.visible) {
    return {
      ...base,
      action: "ignore",
      reason: "agent has no visibility into this channel",
    };
  }

  if (isSelfAuthoredAgentMessage(agent.id, message)) {
    return {
      ...base,
      action: "ignore",
      reason: "self-authored channel message",
      runtimeGuard: "self-authored agent messages are not re-offered to the same agent",
    };
  }

  const effectivePolicy = resolveAgentChannelPolicyForChannel(
    agent.channelPolicy,
    channel,
  );

  if (
    message.origin.addressedAgentId &&
    message.origin.addressedAgentId !== agent.id
  ) {
    return {
      ...base,
      action: "ignore",
      reason: `message is addressed to ${message.origin.addressedAgentId}`,
      effectivePolicy,
    };
  }

  if (!senderMatches(effectivePolicy, message)) {
    return {
      ...base,
      action: "ignore",
      reason: "sender does not match agent channel policy filters",
      effectivePolicy,
    };
  }

  const addressedToAgent = message.origin.addressedAgentId === agent.id;
  const mentionedAgent = isSingleAgentMention(agent.id.toLowerCase(), mentionedAgentIds);
  const explicitlyAllowsAgentSender =
    effectivePolicy.senders.includes("agent") ||
    effectivePolicy.actorIds.includes(message.sender.actorId);

  if (
    message.sender.kind === "agent" &&
    !addressedToAgent &&
    !mentionedAgent &&
    !explicitlyAllowsAgentSender
  ) {
    return {
      ...base,
      action: "ignore",
      reason: "agent-authored message requires an addressed target, single-agent mention, or explicit agent sender opt-in",
      effectivePolicy,
      runtimeGuard: "agent-to-agent wake loop guard",
    };
  }

  switch (effectivePolicy.mode) {
    case "none":
      return {
        ...base,
        action: "ignore",
        reason: "agent channel policy mode is none",
        effectivePolicy,
      };
    case "addressed":
      return addressedToAgent
        ? {
          ...base,
          action: "wake",
          reason: "agent channel policy accepts addressed messages for this agent",
          effectivePolicy,
        }
        : {
          ...base,
          action: "ignore",
          reason: "agent channel policy mode is addressed and message is not addressed to this agent",
          effectivePolicy,
        };
    case "mentions":
      return addressedToAgent || mentionedAgent
        ? {
          ...base,
          action: "wake",
          reason: addressedToAgent
            ? "agent channel policy accepts addressed messages for this agent"
            : "agent channel policy accepts single-agent mentions for this agent",
          effectivePolicy,
        }
        : {
          ...base,
          action: "ignore",
          reason: "agent channel policy mode is mentions and message does not name this agent",
          effectivePolicy,
        };
    case "all":
      return {
        ...base,
        action: "wake",
        reason: "agent channel policy mode is all",
        effectivePolicy,
      };
  }
}

export function shouldAgentWakeForChannelMessage(
  agent: Pick<ResolvedAgentConfig, "id" | "channelPolicy">,
  channel: string,
  message: ChannelMessage,
  opts: EvaluateAgentChannelPolicyOpts,
): boolean {
  return evaluateAgentChannelPolicy(agent, channel, message, opts).action === "wake";
}

function senderMatches(
  policy: Required<AgentChannelPolicyRule>,
  message: ChannelMessage,
): boolean {
  const senderKind: MessageSenderKind = message.sender.kind;
  if (
    policy.senders.length > 0 &&
    !policy.senders.includes(senderKind)
  ) {
    return false;
  }
  if (
    policy.actorIds.length > 0 &&
    !policy.actorIds.includes(message.sender.actorId)
  ) {
    return false;
  }
  if (
    policy.userIds.length > 0 &&
    (!message.sender.userId || !policy.userIds.includes(message.sender.userId))
  ) {
    return false;
  }
  return true;
}

function isSingleAgentMention(agentId: string, mentionedAgentIds: string[]): boolean {
  return mentionedAgentIds.length === 1 && mentionedAgentIds[0] === agentId;
}

export function isSelfAuthoredAgentMessage(
  agentId: string,
  message: ChannelMessage,
): boolean {
  return message.sender.kind === "agent" && message.sender.actorId === `agent:${agentId}`;
}

export function extractMentionedAgentIds(
  message: ChannelMessage,
): string[] {
  const text = searchableText(message);
  if (!text) return [];

  const ids = new Set<string>();
  const pattern = /(^|[^a-zA-Z0-9._-])@([a-zA-Z0-9._-]+)/g;
  for (const match of text.matchAll(pattern)) {
    const id = match[2]?.trim();
    if (id) ids.add(id.toLowerCase());
  }
  return [...ids];
}

export function searchableText(message: ChannelMessage): string {
  if (message.content.type === "text") {
    return message.content.data.text.toLowerCase();
  }

  if (message.content.type === "image") {
    return (message.content.data.caption ?? "").toLowerCase();
  }

  if (message.content.type === "image_group") {
    return (message.content.data.caption ?? "").toLowerCase();
  }

  return JSON.stringify(message.content.data).toLowerCase();
}
