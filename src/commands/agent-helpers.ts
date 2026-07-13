import {
  formatThinkingInputs,
  parseThinkingLevel,
  type ThinkingLevel,
} from "../thinking.js";
import type { AgentChannelPolicyMode } from "../config/agents.js";

export const DEFAULT_AGENT_TOOLS = [
  "reply",
  "ask",
  "notify",
  "report",
  "send_message",
  "read_channel",
];

export const MODEL_SESSION_OPTIONS = {
  provider: { type: "string", short: "p" },
  model: { type: "string", short: "m" },
  "model-policy": { type: "string" },
  thinking: { type: "string" },
  skill: { type: "string", short: "k", multiple: true },
} as const;

interface ModelSessionArgValues {
  provider?: string;
  model?: string;
  "model-policy"?: string;
  thinking?: string;
  skill?: string[];
}

interface ModelSessionValues {
  provider?: string;
  model?: string;
  modelPolicy?: string;
  thinking?: ThinkingLevel;
  skills?: string[];
}

export function readModelSessionValues(
  values: ModelSessionArgValues,
): ModelSessionValues {
  return {
    provider: values.provider,
    model: values.model,
    modelPolicy: values["model-policy"],
    thinking: parseThinking(values.thinking),
    skills: values.skill,
  };
}

export function parseCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function parseThinking(value?: string): ThinkingLevel | undefined {
  if (value === undefined) return undefined;
  const parsed = parseThinkingLevel(value);
  if (!parsed) {
    throw new Error(`thinking level must be one of: ${formatThinkingInputs()}`);
  }
  return parsed;
}

export function parseChannelPolicyMode(
  value?: string,
): AgentChannelPolicyMode | undefined {
  if (value === undefined) return undefined;
  if (
    value === "all" ||
    value === "mentions" ||
    value === "addressed" ||
    value === "none"
  ) {
    return value;
  }
  throw new Error("channel policy mode must be one of: all, mentions, addressed, none");
}
