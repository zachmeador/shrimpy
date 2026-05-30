import type {
  AgentAttentionConfig,
  AgentAttentionMode,
  AgentAttentionRule,
} from "../config/agents.js";

export type AttentionSenderKind = "system" | "human" | "agent";
export type AttentionField = "mode" | "senders" | "actorIds" | "userIds";

export interface AttentionRuleValues {
  mode?: AgentAttentionMode;
  senders?: AttentionSenderKind[];
  actorIds?: string[];
  userIds?: string[];
}

export interface AttentionEdit {
  /** Target a channel-override pattern instead of the base rule. */
  channel?: string;
  /** Fields to set on the target rule. */
  set?: AttentionRuleValues;
  /** Fields to clear from the target rule. */
  clear?: AttentionField[];
  /** Remove the whole channel override (requires `channel`). */
  removeChannel?: boolean;
}

/**
 * Apply a field-level edit to an agent's stored attention config, returning the
 * next config (or `null` when the edit leaves nothing to store). Operates on the
 * raw stored shape so defaults are never materialized into the workspace file.
 */
export function editAttentionConfig(
  current: AgentAttentionConfig | undefined,
  edit: AttentionEdit,
): AgentAttentionConfig | null {
  const channels: Record<string, AgentAttentionRule> = { ...(current?.channels ?? {}) };

  if (edit.channel) {
    if (edit.removeChannel) {
      delete channels[edit.channel];
    } else {
      const nextRule = applyRuleEdit(channels[edit.channel] ?? {}, edit);
      if (isEmptyRule(nextRule)) {
        delete channels[edit.channel];
      } else {
        channels[edit.channel] = nextRule;
      }
    }
    return assemble(splitBase(current), channels);
  }

  return assemble(applyRuleEdit(splitBase(current), edit), channels);
}

function applyRuleEdit(rule: AgentAttentionRule, edit: AttentionEdit): AgentAttentionRule {
  const next: AgentAttentionRule = { ...rule };

  const set = edit.set ?? {};
  if (set.mode !== undefined) next.mode = set.mode;
  if (set.senders !== undefined) next.senders = unique(set.senders);
  if (set.actorIds !== undefined) next.actorIds = unique(set.actorIds);
  if (set.userIds !== undefined) next.userIds = unique(set.userIds);

  for (const field of edit.clear ?? []) {
    delete next[field];
  }

  return pruneRule(next);
}

function splitBase(config?: AgentAttentionConfig): AgentAttentionRule {
  return pruneRule({
    mode: config?.mode,
    senders: config?.senders,
    actorIds: config?.actorIds,
    userIds: config?.userIds,
  });
}

function pruneRule(rule: AgentAttentionRule): AgentAttentionRule {
  const next: AgentAttentionRule = {};
  if (rule.mode !== undefined) next.mode = rule.mode;
  if (rule.senders && rule.senders.length > 0) next.senders = rule.senders;
  if (rule.actorIds && rule.actorIds.length > 0) next.actorIds = rule.actorIds;
  if (rule.userIds && rule.userIds.length > 0) next.userIds = rule.userIds;
  return next;
}

function isEmptyRule(rule: AgentAttentionRule): boolean {
  return Object.keys(rule).length === 0;
}

function assemble(
  base: AgentAttentionRule,
  channels: Record<string, AgentAttentionRule>,
): AgentAttentionConfig | null {
  const config: AgentAttentionConfig = { ...base };
  if (Object.keys(channels).length > 0) {
    config.channels = channels;
  }
  return Object.keys(config).length > 0 ? config : null;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
