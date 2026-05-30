import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { registerShrimpyHelpCommand } from "./shrimpy-commands.ts";

const VERSION = "0.1.0";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setHeader((_tui, theme) => {
      const logo =
        theme.bold(theme.fg("accent", "shrimpy")) +
        theme.fg("dim", ` v${VERSION}`);
      const hints = [
        theme.fg("muted", "/ commands"),
        theme.fg("muted", "! bash"),
        theme.fg("muted", "esc interrupt"),
        theme.fg("muted", "ctrl+c clear"),
      ].join(theme.fg("dim", "  ·  "));
      return new Text(`${logo}\n${hints}`, 1, 0);
    });
  });

  registerShrimpyHelpCommand(pi);
}
