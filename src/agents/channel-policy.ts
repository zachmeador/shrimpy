import type { ChannelMessage } from "../channels/index.js";
import {
  resolveAgentAttentionForChannel,
  type AgentAttentionRule,
  type ResolvedAgentConfig,
} from "../config/agents.js";
import type { MessageSenderKind } from "../channels/index.js";

export interface AgentChannelPolicy {
  shouldHandleMessage(channel: string, message: ChannelMessage): boolean;
}

export interface AgentMessageHandlingExplanation {
  handles: boolean;
  reason: string;
  effectiveAttention?: Required<AgentAttentionRule>;
  impliedRule?: string;
}

interface CreateAgentChannelPolicyOpts {
  agent: Pick<ResolvedAgentConfig, "id" | "attention">;
}

export function createAgentChannelPolicy(
  opts: CreateAgentChannelPolicyOpts,
): AgentChannelPolicy {
  return {
    shouldHandleMessage(channel, message) {
      return shouldAgentHandleMessage(opts.agent, channel, message);
    },
  };
}

export function shouldAgentHandleMessage(
  agent: Pick<ResolvedAgentConfig, "id" | "attention">,
  channel: string,
  message: ChannelMessage,
): boolean {
  return explainAgentMessageHandling(agent, channel, message).handles;
}

export function explainAgentMessageHandling(
  agent: Pick<ResolvedAgentConfig, "id" | "attention">,
  channel: string,
  message: ChannelMessage,
): AgentMessageHandlingExplanation {
  if (message.sender.kind === "agent" && message.sender.actorId === `agent:${agent.id}`) {
    return {
      handles: false,
      reason: "self-authored agent message",
      impliedRule: "agents do not handle their own channel messages",
    };
  }

  if (message.origin.addressedAgentId) {
    const handles = message.origin.addressedAgentId === agent.id;
    return {
      handles,
      reason: handles
        ? "message is explicitly addressed to this agent"
        : `message is explicitly addressed to ${message.origin.addressedAgentId}`,
      impliedRule: "origin.addressedAgentId routes only to that agent",
    };
  }

  if (message.sender.kind === "human" && isExplicitlyTargetedToAgent(agent.id, message)) {
    return {
      handles: true,
      reason: "human single-agent mention",
      impliedRule: "human @agent mentions call that agent even when ambient attention is quiet",
    };
  }

  const attention = resolveAgentAttentionForChannel(agent.attention, channel);
  if (!senderMatches(attention, message)) {
    return {
      handles: false,
      reason: "sender does not match effective attention filters",
      effectiveAttention: attention,
    };
  }

  switch (attention.mode) {
    case "none":
      return {
        handles: false,
        reason: "effective attention mode is none",
        effectiveAttention: attention,
      };
    case "addressed":
      return {
        handles: false,
        reason: "effective attention mode is addressed and message is not explicitly addressed",
        effectiveAttention: attention,
      };
    case "mentions":
      if (isExplicitlyTargetedToAgent(agent.id, message)) {
        return {
          handles: true,
          reason: "effective attention mode is mentions and message names this agent",
          effectiveAttention: attention,
        };
      }
      return {
        handles: false,
        reason: "effective attention mode is mentions and message is not a single-agent mention",
        effectiveAttention: attention,
      };
    case "all":
      return {
        handles: true,
        reason: "effective attention mode is all",
        effectiveAttention: attention,
      };
  }
}

function senderMatches(
  attention: Required<AgentAttentionRule>,
  message: ChannelMessage,
): boolean {
  const senderKind: MessageSenderKind = message.sender.kind;
  if (
    attention.senders.length > 0 &&
    !attention.senders.includes(senderKind)
  ) {
    return false;
  }
  if (
    attention.actorIds.length > 0 &&
    !attention.actorIds.includes(message.sender.actorId)
  ) {
    return false;
  }
  if (
    attention.userIds.length > 0 &&
    (!message.sender.userId || !attention.userIds.includes(message.sender.userId))
  ) {
    return false;
  }
  return true;
}

export function isExplicitlyTargetedToAgent(
  agentId: string,
  message: ChannelMessage,
): boolean {
  if (message.origin.addressedAgentId === agentId) {
    return true;
  }

  const mentions = extractMentionedAgentIds(message);
  return mentions.length === 1 && mentions[0] === agentId;
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
