import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  DAEMON_TOOL_NAMES,
  type DaemonToolName,
} from "../tools/names.js";
import {
  thinkingLevelSchema,
  type ThinkingLevel,
} from "../inference/thinking.js";
import { channelMatches } from "../util/channel-pattern.js";
import {
  modelSelectionSchema,
  type ModelSelectionConfig,
} from "./model.js";

export type AgentAttentionMode = "all" | "mentions" | "addressed" | "none";

export interface AgentAttentionRule {
  mode?: AgentAttentionMode;
  senders?: Array<"system" | "human" | "agent">;
  actorIds?: string[];
  userIds?: string[];
}

export interface AgentAttentionConfig extends AgentAttentionRule {
  channels?: Record<string, AgentAttentionRule>;
}

const attentionModeSchema = Type.Union([
  Type.Literal("all"),
  Type.Literal("mentions"),
  Type.Literal("addressed"),
  Type.Literal("none"),
]);

const attentionRuleSchema = Type.Object(
  {
    mode: Type.Optional(attentionModeSchema),
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

const attentionSchema = Type.Object(
  {
    mode: Type.Optional(attentionModeSchema),
    senders: Type.Optional(Type.Array(Type.Union([
      Type.Literal("system"),
      Type.Literal("human"),
      Type.Literal("agent"),
    ]))),
    actorIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    userIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    channels: Type.Optional(Type.Record(Type.String(), attentionRuleSchema)),
  },
  { additionalProperties: false },
);

const agentSchema = Type.Object(
  {
    id: Type.String({ pattern: "^[a-zA-Z0-9._-]+$", minLength: 1 }),
    root: Type.Optional(Type.String({ minLength: 1 })),
    model: Type.Optional(modelSelectionSchema),
    tools: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    disabledTools: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    thinking: Type.Optional(thinkingLevelSchema),
    attention: Type.Optional(attentionSchema),
  },
  { additionalProperties: false },
);

export type AgentConfig = Static<typeof agentSchema>;
export type ResolvedAgentConfig = {
  id: string;
  root: string;
  model?: ModelSelectionConfig;
  tools?: DaemonToolName[];
  disabledTools?: string[];
  thinking?: ThinkingLevel;
  attention: Required<AgentAttentionConfig>;
};
export const DEFAULT_AGENT_ID = "shrimpy";

function uniqueStrings(values?: string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function resolveAttentionRule(
  raw?: AgentAttentionRule,
): Required<AgentAttentionRule> {
  return {
    mode: raw?.mode ?? "all",
    senders: uniqueStrings(raw?.senders) as Array<"system" | "human" | "agent">,
    actorIds: uniqueStrings(raw?.actorIds),
    userIds: uniqueStrings(raw?.userIds),
  };
}

export function resolveAgentAttention(
  raw?: AgentAttentionConfig,
): Required<AgentAttentionConfig> {
  const base = resolveAttentionRule(raw);
  return {
    ...base,
    channels: Object.fromEntries(
      Object.entries(raw?.channels ?? {}).map(([pattern, rule]) => [
        pattern,
        resolveAttentionRule(rule),
      ]),
    ),
  };
}

export function resolveAgentAttentionForChannel(
  attention: Required<AgentAttentionConfig>,
  channel: string,
): Required<AgentAttentionRule> {
  let rule: Required<AgentAttentionRule> = {
    mode: attention.mode,
    senders: [...attention.senders],
    actorIds: [...attention.actorIds],
    userIds: [...attention.userIds],
  };

  for (const [pattern, override] of Object.entries(attention.channels)) {
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
      attention: resolveAgentAttention(),
    }];
  }
  return validateAgentsConfig(raw).map((agent) => {
    return {
      id: agent.id,
      root: agent.root ?? `agents/${agent.id}`,
      model: agent.model,
      tools: agent.tools?.length
        ? ([...new Set(agent.tools)] as DaemonToolName[])
        : undefined,
      disabledTools: uniqueStrings(agent.disabledTools),
      thinking: agent.thinking,
      attention: resolveAgentAttention(agent.attention),
    };
  });
}
