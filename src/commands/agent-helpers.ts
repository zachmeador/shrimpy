import {
  formatThinkingInputs,
  parseThinkingLevel,
  type ThinkingLevel,
} from "../inference/thinking.js";
import type { AgentAttentionMode } from "../config/agents.js";

export const DEFAULT_AGENT_TOOLS = [
  "reply",
  "ask",
  "notify",
  "report",
  "send_message",
  "read_channel",
  "run_child",
];

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

export function parseAttentionMode(value?: string): AgentAttentionMode | undefined {
  if (value === undefined) return undefined;
  if (
    value === "all" ||
    value === "mentions" ||
    value === "addressed" ||
    value === "none"
  ) {
    return value;
  }
  throw new Error("attention must be one of: all, mentions, addressed, none");
}
