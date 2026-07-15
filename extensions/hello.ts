import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { readAppMetadata } from "../src/app/metadata.ts";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setHeader((_tui, theme) => {
      const metadata = readAppMetadata();
      const logo =
        theme.bold(theme.fg("accent", metadata.name)) +
        theme.fg("dim", ` v${metadata.version}`) +
        (metadata.releaseName
          ? theme.fg("muted", ` - ${metadata.releaseName}`)
          : "");
      const hints = [
        theme.fg("muted", "/ commands"),
        theme.fg("muted", "! bash"),
        theme.fg("muted", "esc interrupt"),
        theme.fg("muted", "ctrl+c clear"),
      ].join(theme.fg("dim", "  ·  "));
      return new Text(`${logo}\n${hints}`, 1, 0);
    });
  });
}
