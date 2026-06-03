import type {
  AgentChannelPolicyConfig,
  AgentChannelPolicyMode,
  AgentChannelPolicyRule,
} from "../config/agents.js";

export type ChannelPolicySenderKind = "system" | "human" | "agent";
export type ChannelPolicyField = "mode" | "senders" | "actorIds" | "userIds";

export interface ChannelPolicyRuleValues {
  mode?: AgentChannelPolicyMode;
  senders?: ChannelPolicySenderKind[];
  actorIds?: string[];
  userIds?: string[];
}

export interface ChannelPolicyEdit {
  /**
   * When set, edit a channel-pattern override. Otherwise edit the base policy.
   */
  channel?: string;
  set?: ChannelPolicyRuleValues;
  clear?: ChannelPolicyField[];
  removeChannel?: boolean;
}

export function editChannelPolicyConfig(
  current: AgentChannelPolicyConfig | undefined,
  edit: ChannelPolicyEdit,
): AgentChannelPolicyConfig | null {
  const channels: Record<string, AgentChannelPolicyRule> = { ...(current?.channels ?? {}) };

  if (edit.channel) {
    if (edit.removeChannel) {
      delete channels[edit.channel];
    } else {
      const next = applyRuleEdit(channels[edit.channel] ?? {}, edit);
      if (isEmptyRule(next)) {
        delete channels[edit.channel];
      } else {
        channels[edit.channel] = next;
      }
    }
    return buildConfig(splitBase(current), channels);
  }

  return buildConfig(
    applyRuleEdit(splitBase(current), edit),
    channels,
  );
}

function applyRuleEdit(
  rule: AgentChannelPolicyRule,
  edit: ChannelPolicyEdit,
): AgentChannelPolicyRule {
  const next: AgentChannelPolicyRule = { ...rule };
  if (edit.set) {
    if (edit.set.mode !== undefined) next.mode = edit.set.mode;
    if (edit.set.senders !== undefined) next.senders = unique(edit.set.senders);
    if (edit.set.actorIds !== undefined) next.actorIds = unique(edit.set.actorIds);
    if (edit.set.userIds !== undefined) next.userIds = unique(edit.set.userIds);
  }
  for (const field of edit.clear ?? []) {
    delete next[field];
  }
  return pruneRule(next);
}

function splitBase(config?: AgentChannelPolicyConfig): AgentChannelPolicyRule {
  return pruneRule({
    mode: config?.mode,
    senders: config?.senders,
    actorIds: config?.actorIds,
    userIds: config?.userIds,
  });
}

function pruneRule(rule: AgentChannelPolicyRule): AgentChannelPolicyRule {
  const next: AgentChannelPolicyRule = {};
  if (rule.mode !== undefined) next.mode = rule.mode;
  if (rule.senders?.length) next.senders = unique(rule.senders);
  if (rule.actorIds?.length) next.actorIds = unique(rule.actorIds);
  if (rule.userIds?.length) next.userIds = unique(rule.userIds);
  return next;
}

function isEmptyRule(rule: AgentChannelPolicyRule): boolean {
  return Object.keys(pruneRule(rule)).length === 0;
}

function buildConfig(
  base: AgentChannelPolicyRule,
  channels: Record<string, AgentChannelPolicyRule>,
): AgentChannelPolicyConfig | null {
  const config: AgentChannelPolicyConfig = { ...base };
  const cleanedChannels = Object.fromEntries(
    Object.entries(channels)
      .map(([pattern, rule]) => [pattern, pruneRule(rule)] as const)
      .filter(([, rule]) => !isEmptyRule(rule)),
  );
  if (Object.keys(cleanedChannels).length > 0) {
    config.channels = cleanedChannels;
  }
  return Object.keys(config).length > 0 ? config : null;
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))] as T[];
}
