import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerArchiveNewSessionExtension } from "../dist/tui/archive-new-session.js";

test("TUI session_start archives the previous transcript only after /new succeeds", () => {
  const dir = mkdtempSync(join(tmpdir(), "shrimpy-archive-new-"));
  mkdirSync(dir, { recursive: true });
  const previous = join(dir, "previous.jsonl");
  writeSessionFile(previous);
  let sessionStart: Function | undefined;
  registerArchiveNewSessionExtension({
    on(event: string, handler: Function): void {
      assert.equal(event, "session_start");
      sessionStart = handler;
    },
  } as never);

  sessionStart!(
    { type: "session_start", reason: "startup" },
    { mode: "tui", ui: { notify(): void {} } },
  );
  assert.doesNotMatch(readFileSync(previous, "utf-8"), /"state":"archived"/);

  sessionStart!(
    { type: "session_start", reason: "new", previousSessionFile: previous },
    { mode: "tui", ui: { notify(): void {} } },
  );
  assert.match(readFileSync(previous, "utf-8"), /"state":"archived"/);
});

function writeSessionFile(path: string): void {
  writeFileSync(path, `${JSON.stringify({
    type: "session",
    version: 3,
    id: "previous",
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
  })}\n`);
}
