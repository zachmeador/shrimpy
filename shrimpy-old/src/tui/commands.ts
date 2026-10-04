import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { projectRoot } from "../app/project-root.js";
import { showReadOnlyPanel } from "./read-only-panel.js";
import { showShrimpySettings } from "./settings.js";
import {
  buildStatusText,
  completeStatusSection,
  type ShrimpyTuiCommandOptions,
} from "./status.js";

export type { ShrimpyTuiCommandOptions } from "./status.js";

export const HELP_TEXT = [
  "Shrimpy commands",
  "",
  "/status [section]   Show operational Shrimpy status",
  "/agents [id]        Navigate agents and local sessions",
  "/settings           Edit durable Pi preferences",
  "/model              Select the session model",
  "/thinking           Select thinking; Ctrl+S saves the agent default",
  "/changelog          Show the Shrimpy changelog",
  "/shrimpy settings  Edit Shrimpy session defaults",
  "/shrimpy            Show this command list",
  "",
  "Pi commands remain available; Shrimpy keeps its agent navigation, home-agent status, session defaults, model guardrails, and changelog surface.",
].join("\n");

export function createShrimpyTuiCommandExtensionFactory(
  options: ShrimpyTuiCommandOptions,
): ExtensionFactory {
  return (pi) => {
    pi.registerCommand("status", {
      description: "Show Shrimpy operational status",
      getArgumentCompletions: completeStatusSection,
      handler: async (args, ctx) => {
        await showReadOnlyPanel(
          ctx,
          "Shrimpy Status",
          buildStatusText(ctx, options, args),
        );
      },
    });

    pi.registerCommand("shrimpy", {
      description: "Show Shrimpy help, settings, or changelog",
      getArgumentCompletions: completeShrimpyCommand,
      handler: async (args, ctx) => {
        const command = args.trim().toLowerCase();
        if (!command || command === "help") {
          await showReadOnlyPanel(ctx, "Shrimpy", HELP_TEXT);
          return;
        }
        if (command === "settings") {
          await showShrimpySettings(ctx, options.runtime);
          return;
        }
        if (command === "changelog") {
          const path = join(projectRoot, "CHANGELOG.md");
          const text = existsSync(path)
            ? readFileSync(path, "utf-8").trim()
            : "No Shrimpy changelog entries found.";
          await showReadOnlyPanel(ctx, "What's New in Shrimpy", text, {
            markdown: true,
          });
          return;
        }
        ctx.ui.notify(
          `Unknown Shrimpy command "${command}". Use /shrimpy, /shrimpy settings, or /shrimpy changelog.`,
          "warning",
        );
      },
    });
  };
}

function completeShrimpyCommand(prefix: string) {
  const normalized = prefix.trim().toLowerCase();
  return ["settings", "changelog"]
    .filter((command) => !normalized || command.startsWith(normalized))
    .map((command) => ({ value: command, label: command }));
}
