import { Type } from "@sinclair/typebox";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

export type { ThinkingLevel } from "@earendil-works/pi-agent-core";

export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const satisfies readonly ThinkingLevel[];

export const thinkingLevelSchema = Type.Union(
  THINKING_LEVELS.map((level) => Type.Literal(level)),
);

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string"
    && THINKING_LEVELS.includes(value as ThinkingLevel);
}

export function parseThinkingLevel(value: unknown): ThinkingLevel | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return isThinkingLevel(normalized) ? normalized : undefined;
}

export function formatThinkingLevels(): string {
  return THINKING_LEVELS.join(", ");
}

export function formatThinkingInputs(): string {
  return formatThinkingLevels();
}
