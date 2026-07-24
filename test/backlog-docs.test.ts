import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

test("CTX-012 backlog note is present and indexed", () => {
  const indexPath = join(root, "docs", "backlog", "index.md");
  const notePath = join(root, "docs", "backlog", "ctx-012-exact-context-command-parity.md");

  assert.equal(existsSync(notePath), true);

  const index = readFileSync(indexPath, "utf-8");
  assert.match(
    index,
    /\| \[CTX-012\]\(ctx-012-exact-context-command-parity\.md\) \| review \| P2 \| Context \| \[CTX-013\]\(ctx-013-separate-stable-context-and-turn-producers\.md\) \| Make `shrimpy context` match real turns \|/,
  );

  const note = readFileSync(notePath, "utf-8");
  assert.match(note, /^status: review$/m);
  assert.match(note, /^priority: P2$/m);
  assert.match(note, /^area: Context$/m);
  assert.match(note, /^  - CTX-013$/m);
  assert.match(note, /same context as a real run/);
  assert.match(note, /\[CTX-009\]\(proposals\/ctx-009-context-trace-debug-view\.md\)/);
  assert.match(note, /Tests prove parity between `shrimpy context` output and captured live session\/model-call context/);
});
