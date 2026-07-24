import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DynamicBorder,
  type AgentSession,
  type InteractiveMode,
} from "@earendil-works/pi-coding-agent";
import {
  Markdown,
  Spacer,
  Text,
  type Component,
} from "@earendil-works/pi-tui";
import { projectRoot } from "../app/project-root.js";
import { theme } from "../app/pi-internals.js";
import { HELP_TEXT } from "./commands.js";
import {
  buildStatusText,
  type ShrimpyTuiCommandOptions,
} from "./status.js";

interface InlineCommandMode {
  setupEditorSubmitHandler(): void;
  handleChangelogCommand(): void;
  defaultEditor: {
    onSubmit?: (text: string) => Promise<void> | void;
  };
  editor: {
    setText(text: string): void;
  };
  session: AgentSession;
  showStatus(message: string): void;
  chatContainer: {
    addChild(component: Component): void;
  };
  ui: {
    requestRender(): void;
  };
  getMarkdownThemeWithSettings(): ConstructorParameters<typeof Markdown>[3];
}

/**
 * Pi has no public API for inline ephemeral transcript blocks or overriding
 * built-in /changelog. Keep this seam limited to those command interactions;
 * /new lifecycle, tool expansion, and context rendering live elsewhere.
 */
export function installShrimpyInlineCommands(
  interactive: InteractiveMode,
  options: ShrimpyTuiCommandOptions,
): void {
  const mode = interactive as unknown as InlineCommandMode;
  if (
    typeof mode.setupEditorSubmitHandler !== "function"
    || typeof mode.handleChangelogCommand !== "function"
  ) {
    return;
  }
  const originalSetupEditorSubmitHandler = mode.setupEditorSubmitHandler.bind(mode);

  mode.handleChangelogCommand = () => appendShrimpyChangelog(mode);
  mode.setupEditorSubmitHandler = () => {
    originalSetupEditorSubmitHandler();
    const originalSubmit = mode.defaultEditor.onSubmit;

    mode.defaultEditor.onSubmit = async (text) => {
      const trimmed = text.trim();
      if (trimmed === "/share") {
        mode.editor.setText("");
        mode.showStatus("Share is hidden in Shrimpy for now");
        return;
      }
      if (trimmed === "/shrimpy") {
        appendTextBlock(mode, HELP_TEXT);
        mode.editor.setText("");
        return;
      }
      if (trimmed === "/status" || trimmed.startsWith("/status ")) {
        const args = trimmed.slice("/status".length);
        const title = statusTitle(args);
        appendTextBlock(
          mode,
          `${theme.bold(title)}\n\n${buildStatusText({
            cwd: options.cwd,
            model: mode.session.model,
          }, options, args)}`,
        );
        mode.editor.setText("");
        return;
      }

      await originalSubmit?.(text);
    };
  };
}

function appendShrimpyChangelog(mode: InlineCommandMode): void {
  const path = join(projectRoot, "CHANGELOG.md");
  const markdown = existsSync(path)
    ? readFileSync(path, "utf-8").trim()
    : "No Shrimpy changelog entries found.";
  mode.chatContainer.addChild(new Spacer(1));
  mode.chatContainer.addChild(new DynamicBorder());
  mode.chatContainer.addChild(
    new Text(theme.bold(theme.fg("accent", "What's New in Shrimpy")), 1, 0),
  );
  mode.chatContainer.addChild(new Spacer(1));
  mode.chatContainer.addChild(
    new Markdown(markdown, 1, 1, mode.getMarkdownThemeWithSettings()),
  );
  mode.chatContainer.addChild(new DynamicBorder());
  mode.ui.requestRender();
}

function appendTextBlock(mode: InlineCommandMode, text: string): void {
  mode.chatContainer.addChild(new Spacer(1));
  mode.chatContainer.addChild(new Text(text, 1, 0));
  mode.ui.requestRender();
}

function statusTitle(args: string): string {
  const normalized = args.trim();
  if (!normalized || normalized === "overview") return "Shrimpy Status";
  return normalized
    .split(/[-_\s]+/u)
    .map((part) => part ? part[0]!.toUpperCase() + part.slice(1) : part)
    .join(" ");
}
