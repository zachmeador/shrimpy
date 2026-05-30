import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  installShrimpyActivityIndicator,
  renderShrimpyActivityFooter,
} from "../dist/tui/shrimpy-activity-indicator.js";

test("Shrimpy activity footer parks the shrimp at bottom left when idle", () => {
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats"], 30, false, 0), [
    "     cwd",
    "🦐   stats",
  ]);
});

test("Shrimpy activity footer rotates the shrimp while busy", () => {
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats"], 30, true, 1), [
    "  🦐 cwd",
    "     stats",
  ]);
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats"], 30, true, 2), [
    "     cwd",
    "  🦐 stats",
  ]);
});

test("Shrimpy activity footer stays on the bottom rows with extra status lines", () => {
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats", "status"], 30, true, 3), [
    "     cwd",
    "     stats",
    "🦐   status",
  ]);
});

test("Shrimpy activity indicator wraps the existing footer", () => {
  let disposed = false;
  const interactive = {
    footer: {
      render(width: number): string[] {
        return [`cwd:${width}`, "stats"];
      },
      dispose(): void {
        disposed = true;
      },
    },
    session: {
      isStreaming: false,
    },
    ui: {
      requestRender(): void {},
    },
  };

  installShrimpyActivityIndicator(interactive);

  assertFooterLines(interactive.footer.render(30), [
    "     cwd:25",
    "🦐   stats",
  ]);

  interactive.footer.dispose();
  assert.equal(disposed, true);
});

function assertFooterLines(lines: string[], expectedTrimmed: string[]): void {
  assert.deepEqual(lines.map((line) => line.trimEnd()), expectedTrimmed);
  assert.deepEqual(lines.map((line) => visibleWidth(line)), Array(lines.length).fill(30));
}
