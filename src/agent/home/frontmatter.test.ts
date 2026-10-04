import assert from "node:assert/strict";
import { test } from "node:test";
import { frontmatter } from "./frontmatter.ts";

const block = (...lines: string[]): string => ["---", ...lines, "---", "# Title", "body"].join("\n");

test("plain and quoted values are read, and a colon inside a value stays in it", () => {
  const values = frontmatter(
    block(
      "name: code-review",
      'description: "Review a diff: bugs, style and \\"naming\\"."',
      "owner: 'it''s mine'",
      "note: Use when: the user asks",
    ),
  );

  assert.deepEqual(Object.fromEntries(values ?? []), {
    name: "code-review",
    description: 'Review a diff: bugs, style and "naming".',
    owner: "it's mine",
    note: "Use when: the user asks",
  });
});

test("a value that goes on over indented lines, or starts with | or >, is one line", () => {
  const values = frontmatter(
    block(
      "description: |",
      "  Compact the journal.",
      "",
      "  Keep it   small.",
      "folded: >-",
      "  one",
      "  two",
      "plain: starts here",
      "  and goes on",
      "empty:",
      "  after a break",
    ),
  );

  assert.deepEqual(Object.fromEntries(values ?? []), {
    description: "Compact the journal. Keep it small.",
    folded: "one two",
    plain: "starts here and goes on",
    empty: "after a break",
  });
});

test("comments are skipped, keys may have hyphens, and a key with no value is empty", () => {
  const values = frontmatter(block("# a comment", "disable-model-invocation: true", "name:"));

  assert.deepEqual(Object.fromEntries(values ?? []), { "disable-model-invocation": "true", name: "" });
});

test("a Windows file and a file with a byte order mark read the same", () => {
  const text = "﻿---\r\nname: a\r\ndescription: b\r\n---\r\nbody";

  assert.deepEqual(Object.fromEntries(frontmatter(text) ?? []), { name: "a", description: "b" });
});

test("a file with no front matter, or front matter that never ends, has none", () => {
  assert.equal(frontmatter("# Just a title\n"), undefined);
  assert.equal(frontmatter("name: a\n---\n"), undefined);
  assert.equal(frontmatter("---\nname: a\ndescription: b\n"), undefined);
  assert.equal(frontmatter(""), undefined);
});

test("only the first block counts", () => {
  const text = "---\nname: a\n---\nbody\n---\nname: b\n---\n";

  assert.equal(frontmatter(text)?.get("name"), "a");
});
