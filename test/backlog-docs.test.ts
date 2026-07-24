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
    /\| \[CTX-012\]\(ctx-012-exact-context-command-parity\.md\) \| todo \| P2 \| Context \| \[CTX-013\]\(ctx-013-separate-stable-context-and-turn-producers\.md\) \| Exact provider-facing context from `shrimpy context` \|/,
  );

  const note = readFileSync(notePath, "utf-8");
  assert.match(note, /Status: todo/);
  assert.match(note, /Priority: P2/);
  assert.match(note, /Area: Context/);
  assert.match(note, /Depends On: \[CTX-013\]\(ctx-013-separate-stable-context-and-turn-producers\.md\)/);
  assert.match(note, /provider-facing message payload/);
  assert.match(note, /\[CTX-009\]\(later\/ctx-009-context-trace-debug-view\.md\)/);
  assert.match(note, /Tests prove parity between `shrimpy context` output and captured live session\/model-call context/);
});
