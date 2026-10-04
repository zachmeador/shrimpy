import { basename } from "node:path";
import type { InteractiveMode } from "@earendil-works/pi-coding-agent";
import type { Terminal } from "@earendil-works/pi-tui";

interface InteractiveModeTitleInternals {
  ui: {
    terminal: Pick<Terminal, "setTitle">;
  };
}

interface ShrimpyTerminalTitleContext {
  agentId: string;
  cwd: string;
}

export function installShrimpyTerminalTitle(
  interactive: InteractiveMode,
  getContext: () => ShrimpyTerminalTitleContext,
): void {
  const terminal =
    (interactive as unknown as InteractiveModeTitleInternals).ui.terminal;
  const setUpstreamTitle = terminal.setTitle.bind(terminal);
  terminal.setTitle = () => {
    setUpstreamTitle(formatShrimpyTerminalTitle(getContext()));
  };
}

export function formatShrimpyTerminalTitle(
  context: ShrimpyTerminalTitleContext,
): string {
  const cwd = basename(context.cwd) || context.cwd;
  return `🦐 - Agent: ${context.agentId} - cwd: ${cwd}`;
}
