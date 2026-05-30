import { test } from "node:test";
import assert from "node:assert/strict";
import {
  installShrimpyActivityIndicator,
  renderShrimpyActivityFooter,
} from "../dist/tui/shrimpy-activity-indicator.js";

test("Shrimpy activity footer parks the shrimp at bottom left when idle", () => {
  assert.deepEqual(
    renderShrimpyActivityFooter(["cwd", "stats"], 30, false, 0),
    [
      "     cwd",
      "🦐   stats",
    ],
  );
});

test("Shrimpy activity footer rotates the shrimp while busy", () => {
  assert.deepEqual(
    renderShrimpyActivityFooter(["cwd", "stats"], 30, true, 1),
    [
      "  🦐 cwd",
      "     stats",
    ],
  );
  assert.deepEqual(
    renderShrimpyActivityFooter(["cwd", "stats"], 30, true, 2),
    [
      "     cwd",
      "  🦐 stats",
    ],
  );
});

test("Shrimpy activity footer stays on the bottom rows with extra status lines", () => {
  assert.deepEqual(
    renderShrimpyActivityFooter(["cwd", "stats", "status"], 30, true, 3),
    [
      "     cwd",
      "     stats",
      "🦐   status",
    ],
  );
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

  assert.deepEqual(interactive.footer.render(30), [
    "     cwd:25",
    "🦐   stats",
  ]);

  interactive.footer.dispose();
  assert.equal(disposed, true);
});
