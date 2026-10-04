import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { archiveSessionFile } from "../sessions/transcript-store.js";

export function registerArchiveNewSessionExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (event, ctx) => {
    if (
      ctx.mode !== "tui"
      || event.reason !== "new"
      || !event.previousSessionFile
    ) {
      return;
    }

    try {
      archiveSessionFile(event.previousSessionFile);
    } catch (error) {
      console.error("[tui] failed to archive previous session after /new:", error);
      ctx.ui.notify(
        "New session started, but the previous session was not archived",
        "warning",
      );
    }
  });
}
