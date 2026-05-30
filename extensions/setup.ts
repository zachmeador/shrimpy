import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readSessionMetadata } from "../src/context/metadata.ts";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const metadata = readSessionMetadata(
      ctx.sessionManager.getSessionDir(),
    );
    if (!metadata || !ctx.hasUI) return;

    if (metadata.sessionType === "setup-provider") {
      ctx.ui.notify(
        "Provider bootstrap: use /login, then /model. When one model works, quit and setup will continue.",
        "info",
      );
    }
  });
}
