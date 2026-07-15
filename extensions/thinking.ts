import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import {
  ThinkingSelectorComponent,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import {
  formatThinkingInputs,
  parseThinkingLevel,
  THINKING_LEVELS,
} from "../src/thinking.ts";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("thinking", {
    description: "Set the session thinking level",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      const matches = THINKING_LEVELS.filter((level) =>
        normalized.length === 0 || level.startsWith(normalized)
      );
      return matches.map((level) => ({ value: level, label: level }));
    },
    handler: async (args, ctx) => {
      let requested = args.trim().toLowerCase();
      if (!requested && ctx.mode === "tui") {
        const availableLevels = ctx.model
          ? getSupportedThinkingLevels(ctx.model)
          : [...THINKING_LEVELS];
        requested = (await ctx.ui.custom<ThinkingLevel | undefined>(
          (_tui, _theme, _keybindings, done) =>
            new ThinkingSelectorComponent(
              pi.getThinkingLevel(),
              availableLevels,
              (level) => done(level),
              () => done(undefined),
            ),
        )) ?? "";
        if (!requested) return;
      } else if (!requested) {
        ctx.ui.notify(
          `Usage: /thinking <level> (${formatThinkingInputs()}); current ${pi.getThinkingLevel()}`,
          "info",
        );
        return;
      } else {
        await ctx.waitForIdle();
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
