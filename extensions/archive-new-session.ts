import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerArchiveNewSessionExtension } from "../src/tui/archive-new-session.ts";

export default function (pi: ExtensionAPI): void {
  registerArchiveNewSessionExtension(pi);
}
