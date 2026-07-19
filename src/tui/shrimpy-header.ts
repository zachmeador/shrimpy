import type { ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { readAppMetadata } from "../app/metadata.js";

export function createShrimpyHeaderExtensionFactory(
  getAgentId: () => string,
): ExtensionFactory {
  return (pi) => {
    pi.on("session_start", (_event, ctx) => {
      if (ctx.mode !== "tui") return;
      ctx.ui.setHeader((_tui, theme) => {
        const metadata = readAppMetadata();
        const logo =
          theme.bold(theme.fg("accent", metadata.name));
        const identity =
          theme.fg("dim", "  ·  agent ")
          + theme.bold(theme.fg("accent", getAgentId()));
        const release =
          theme.fg("dim", `  ·  v${metadata.version}`)
          + (metadata.releaseName
            ? theme.fg("muted", ` - ${metadata.releaseName}`)
            : "");
        const hints = [
          theme.fg("muted", "/ commands"),
          theme.fg("muted", "! bash"),
          theme.fg("muted", "esc interrupt"),
          theme.fg("muted", "ctrl+c clear"),
        ].join(theme.fg("dim", "  ·  "));
        return new FixedHeightHeader([logo + identity + release, hints]);
      });
    });
  };
}

class FixedHeightHeader implements Component {
  constructor(private readonly lines: string[]) {}

  invalidate(): void {}

  render(width: number): string[] {
    return this.lines.map((line) => truncateToWidth(line, Math.max(1, width), ""));
  }
}
