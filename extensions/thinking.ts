import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

type ThinkingLevel = (typeof THINKING_LEVELS)[number];

const THINKING_LEVEL_ALIASES: Record<string, ThinkingLevel> = {
  on: "medium",
};

function isThinkingLevel(value: string): value is ThinkingLevel {
  return THINKING_LEVELS.includes(value as ThinkingLevel);
}

function formatThinkingLevels(): string {
  return THINKING_LEVELS.join(", ");
}

function formatThinkingInputs(): string {
  return `${formatThinkingLevels()}, on (= medium)`;
}

function parseThinkingLevel(value: string): ThinkingLevel | undefined {
  const normalized = value.trim().toLowerCase();
  if (isThinkingLevel(normalized)) return normalized;
  return THINKING_LEVEL_ALIASES[normalized];
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("thinking", {
    description: "Set the session thinking level",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      const inputs = ["on", ...THINKING_LEVELS];
      const matches = inputs.filter((level) =>
        normalized.length === 0 || level.startsWith(normalized)
      );
      return matches.map((level) => ({ value: level, label: level }));
    },
    handler: async (args, ctx) => {
      await ctx.waitForIdle();

      const requested = args.trim().toLowerCase();
      if (!requested) {
        ctx.ui.notify(
          `Usage: /thinking <level> (${formatThinkingInputs()}); current ${pi.getThinkingLevel()}`,
          "info",
        );
        return;
      }

      const level = parseThinkingLevel(requested);
      if (!level) {
        ctx.ui.notify(
          `Invalid thinking level "${requested}". Use: ${formatThinkingInputs()}`,
          "warning",
        );
        return;
      }

      pi.setThinkingLevel(level);
      const effective = pi.getThinkingLevel();
      ctx.ui.notify(
        effective === level && requested === level
          ? `Thinking set to ${effective}`
          : `Thinking set to ${effective} (requested ${requested})`,
        "info",
      );
    },
  });
}
