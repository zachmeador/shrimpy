import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  installShrimpyActivityIndicator,
  renderShrimpyActivityFooter,
} from "../dist/tui/shrimpy-activity-indicator.js";

test("Shrimpy activity footer parks the shrimp on the existing bottom row when idle", () => {
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats"], 30, false, 0), [
    "cwd",
    /^stats\s+🦐$/u,
  ]);
});

test("Shrimpy activity footer rotates the shrimp while busy", () => {
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats"], 30, true, 1), [
    /^cwd\s+🦐$/u,
    "stats",
  ]);
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats"], 30, true, 2), [
    "cwd",
    /^stats\s+🦐$/u,
  ]);
});

test("Shrimpy activity footer stays on existing bottom rows with extra status lines", () => {
  assertFooterLines(renderShrimpyActivityFooter(["cwd", "stats", "status"], 30, true, 3), [
    "cwd",
    "stats",
    /^status\s+🦐$/u,
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
    "cwd:24",
    /^stats\s+🦐$/u,
  ]);

  interactive.footer.dispose();
  assert.equal(disposed, true);
});

function assertFooterLines(
  lines: string[],
  expectedTrimmed: Array<string | RegExp>,
): void {
  assert.equal(lines.length, expectedTrimmed.length);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trimEnd();
    const expected = expectedTrimmed[index];
    if (expected instanceof RegExp) {
      assert.match(trimmed, expected);
    } else {
      assert.equal(trimmed, expected);
    }
    assert.ok(
      visibleWidth(line) <= 30,
      `line ${index} exceeds test terminal width: ${visibleWidth(line)}`,
    );
  }
}
