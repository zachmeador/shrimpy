import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  DAEMON_TOOL_NAMES,
  type DaemonToolName,
} from "../tools/names.js";
import {
  thinkingLevelSchema,
  type ThinkingLevel,
} from "../sessions/thinking.js";
import { channelMatches } from "../util/channel-pattern.js";

export type AgentChannelPolicyMode = "all" | "mentions" | "addressed" | "none";

export interface AgentChannelPolicyRule {
  mode?: AgentChannelPolicyMode;
  senders?: Array<"system" | "human" | "agent">;
  actorIds?: string[];
  userIds?: string[];
}

export interface AgentChannelPolicyConfig extends AgentChannelPolicyRule {
  channels?: Record<string, AgentChannelPolicyRule>;
}

const channelPolicyModeSchema = Type.Union([
  Type.Literal("all"),
  Type.Literal("mentions"),
  Type.Literal("addressed"),
  Type.Literal("none"),
]);

const channelPolicyRuleSchema = Type.Object(
  {
    mode: Type.Optional(channelPolicyModeSchema),
    senders: Type.Optional(Type.Array(Type.Union([
      Type.Literal("system"),
      Type.Literal("human"),
      Type.Literal("agent"),
    ]))),
    actorIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    userIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  },
  { additionalProperties: false },
);

const channelPolicySchema = Type.Object(
  {
    mode: Type.Optional(channelPolicyModeSchema),
    senders: Type.Optional(Type.Array(Type.Union([
      Type.Literal("system"),
      Type.Literal("human"),
      Type.Literal("agent"),
    ]))),
    actorIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    userIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    channels: Type.Optional(Type.Record(Type.String(), channelPolicyRuleSchema)),
  },
  { additionalProperties: false },
);

const agentSchema = Type.Object(
  {
    id: Type.String({ pattern: "^[a-zA-Z0-9._-]+$", minLength: 1 }),
    root: Type.Optional(Type.String({ minLength: 1 })),
    modelPolicy: Type.Optional(Type.String({ minLength: 1 })),
    tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    disabledTools: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    thinking: Type.Optional(thinkingLevelSchema),
    channelPolicy: Type.Optional(channelPolicySchema),
  },
  { additionalProperties: false },
);

export type AgentConfig = Static<typeof agentSchema>;
export type ResolvedAgentConfig = {
  id: string;
  root: string;
  modelPolicy?: string;
  tools?: DaemonToolName[];
  disabledTools?: string[];
  thinking?: ThinkingLevel;
  channelPolicy: Required<AgentChannelPolicyConfig>;
};
export const DEFAULT_AGENT_ID = "shrimpy";

function uniqueStrings(values?: string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function resolveChannelPolicyRule(
  raw?: AgentChannelPolicyRule,
): Required<AgentChannelPolicyRule> {
  return {
    mode: raw?.mode ?? "all",
    senders: uniqueStrings(raw?.senders) as Array<"system" | "human" | "agent">,
    actorIds: uniqueStrings(raw?.actorIds),
    userIds: uniqueStrings(raw?.userIds),
  };
}

export function resolveAgentChannelPolicy(
  raw?: AgentChannelPolicyConfig,
): Required<AgentChannelPolicyConfig> {
  const base = resolveChannelPolicyRule(raw);
  return {
    ...base,
    channels: Object.fromEntries(
      Object.entries(raw?.channels ?? {}).map(([pattern, rule]) => [
        pattern,
        resolveChannelPolicyRule(rule),
      ]),
    ),
  };
}

export function resolveAgentChannelPolicyForChannel(
  channelPolicy: Required<AgentChannelPolicyConfig>,
  channel: string,
): Required<AgentChannelPolicyRule> {
  let rule: Required<AgentChannelPolicyRule> = {
    mode: channelPolicy.mode,
    senders: [...channelPolicy.senders],
    actorIds: [...channelPolicy.actorIds],
    userIds: [...channelPolicy.userIds],
  };

  for (const [pattern, override] of Object.entries(channelPolicy.channels)) {
    if (!channelMatches(pattern, channel)) continue;
    const senders = override.senders ?? [];
    const actorIds = override.actorIds ?? [];
    const userIds = override.userIds ?? [];
    rule = {
      mode: override.mode ?? rule.mode,
      senders: senders.length > 0
        ? [...senders]
        : rule.senders,
      actorIds: actorIds.length > 0
        ? [...actorIds]
        : rule.actorIds,
      userIds: userIds.length > 0
        ? [...userIds]
        : rule.userIds,
    };
  }

  return rule;
}

export function validateAgentsConfig(raw: unknown): AgentConfig[] {
  if (!Array.isArray(raw)) throw new Error("agents must be an array");
  if (raw.length === 0) throw new Error("agents must contain at least one entry");

  const agents = raw.map((entry, i) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`agents[${i}] must be an object`);
    }
    if (!Value.Check(agentSchema, entry)) {
      const [err] = Value.Errors(agentSchema, entry);
      throw new Error(`agents[${i}]: ${err?.message ?? "invalid"}`);
    }
    return entry as AgentConfig;
  });

  const seen = new Set<string>();
  for (const agent of agents) {
    if (seen.has(agent.id)) {
      throw new Error(`agents contains duplicate id "${agent.id}"`);
    }
    seen.add(agent.id);
    for (const tool of agent.tools ?? []) {
      if (!isDaemonToolName(tool)) {
        throw new Error(
          `agents["${agent.id}"].tools contains unknown daemon tool "${tool}". Known tools: ${DAEMON_TOOL_NAMES.join(", ")}`,
        );
      }
    }
  }

  return agents;
}

function isDaemonToolName(value: string): value is DaemonToolName {
  return (DAEMON_TOOL_NAMES as readonly string[]).includes(value);
}

export function resolveAgentsConfig(raw: unknown): ResolvedAgentConfig[] {
  if (raw === undefined) {
    return [{
      id: DEFAULT_AGENT_ID,
      root: `agents/${DEFAULT_AGENT_ID}`,
      channelPolicy: resolveAgentChannelPolicy(),
    }];
  }
  return validateAgentsConfig(raw).map((agent) => {
    return {
      id: agent.id,
      root: agent.root ?? `agents/${agent.id}`,
      modelPolicy: agent.modelPolicy,
      tools: agent.tools?.length
        ? ([...new Set(agent.tools)] as DaemonToolName[])
        : undefined,
      disabledTools: uniqueStrings(agent.disabledTools),
      thinking: agent.thinking,
      channelPolicy: resolveAgentChannelPolicy(agent.channelPolicy),
    };
  });
}
