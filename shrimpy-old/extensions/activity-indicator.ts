import type {
  ExtensionAPI,
  WorkingIndicatorOptions,
} from "@earendil-works/pi-coding-agent";

export const SHRIMPY_WORKING_INDICATOR: WorkingIndicatorOptions = {
  frames: ["🦐  ", " 🦐 ", "  🦐", " 🦐 "],
  intervalMs: 180,
};

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWorkingIndicator(SHRIMPY_WORKING_INDICATOR);
  });
}
