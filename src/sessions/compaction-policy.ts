import type { Api, Model } from "@earendil-works/pi-ai";
import { basename } from "node:path";
import type { RuntimeConfig } from "../config/index.js";
import { channelMatches } from "../util/channel-pattern.js";
import type { SessionDescriptor } from "./spec.js";

interface CompactionPolicyOverride {
  enabled?: boolean;
  reserveTokens?: number;
  thresholdTokens?: number;
  keepRecentTokens?: number;
  instructions?: string;
}

export interface EffectiveCompactionPolicy {
  enabled: boolean;
  reserveTokens: number;
  thresholdTokens?: number;
  keepRecentTokens: number;
  instructions?: string;
  matched: string[];
}

type RuntimeCompactionConfig = Required<RuntimeConfig>["compaction"] & {
  thresholdTokens?: number;
  instructions?: string;
  agents?: Record<string, CompactionPolicyOverride>;
  channels?: Record<string, CompactionPolicyOverride>;
  sessions?: Record<string, CompactionPolicyOverride>;
};

export function resolveSessionCompactionPolicy(input: {
  runtimeConfig: Required<RuntimeConfig>;
  descriptor: SessionDescriptor;
  model?: Model<Api>;
}): EffectiveCompactionPolicy {
  const base = input.runtimeConfig.compaction as RuntimeCompactionConfig;
  const policy: EffectiveCompactionPolicy = {
    enabled: base.enabled,
    reserveTokens: base.reserveTokens,
    thresholdTokens: base.thresholdTokens,
    keepRecentTokens: base.keepRecentTokens,
    instructions: base.instructions,
    matched: ["runtime.compaction"],
  };

  const sessionLabel = basename(input.descriptor.sessionDir);
  const agentId = input.descriptor.agentId;

  if (agentId) {
    applyOverride(policy, base.agents?.[agentId], `runtime.compaction.agents.${agentId}`);
  }

  applyOverride(policy, base.sessions?.[input.descriptor.kind], `runtime.compaction.sessions.${input.descriptor.kind}`);

  if (input.descriptor.channel) {
    for (const [pattern, override] of Object.entries(base.channels ?? {})) {
      if (!channelMatches(pattern, input.descriptor.channel)) continue;
      applyOverride(policy, override, `runtime.compaction.channels.${pattern}`);
    }
  }

  applyOverride(policy, base.sessions?.[sessionLabel], `runtime.compaction.sessions.${sessionLabel}`);

  if (policy.thresholdTokens !== undefined && input.model?.contextWindow) {
    policy.reserveTokens = Math.max(0, input.model.contextWindow - policy.thresholdTokens);
  }

  return policy;
}

function applyOverride(
  policy: EffectiveCompactionPolicy,
  override: CompactionPolicyOverride | undefined,
  source: string,
): void {
  if (!override) return;
  if (override.enabled !== undefined) policy.enabled = override.enabled;
  if (override.reserveTokens !== undefined) policy.reserveTokens = override.reserveTokens;
  if (override.thresholdTokens !== undefined) policy.thresholdTokens = override.thresholdTokens;
  if (override.keepRecentTokens !== undefined) policy.keepRecentTokens = override.keepRecentTokens;
  if (override.instructions !== undefined) policy.instructions = override.instructions;
  policy.matched.push(source);
}
