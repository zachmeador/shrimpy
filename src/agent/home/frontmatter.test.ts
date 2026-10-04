import assert from "node:assert/strict";
import { test } from "node:test";
import { frontmatter } from "./frontmatter.ts";

const block = (...lines: string[]): string => ["---", ...lines, "---", "# Title", "body"].join("\n");

test("plain and quoted values are read, and so are values that go on over indented lines or start with | or >", () => {
  const values = frontmatter(
    block(
      "name: code-review",
      'description: "Review a diff: bugs, style and \\"naming\\"."',
      "note: Use when: the user asks",
      "folded: |",
      "  Compact the journal.",
      "",
      "  Keep it   small.",
      "plain: starts here",
      "  and goes on",
    ),
  );

  assert.deepEqual(Object.fromEntries(values ?? []), {
    name: "code-review",
    description: 'Review a diff: bugs, style and "naming".',
    note: "Use when: the user asks",
    folded: "Compact the journal. Keep it small.",
    plain: "starts here and goes on",
  });
});

test("a file with no front matter, or front matter that never ends, has none", () => {
  assert.equal(frontmatter("# Just a title\n"), undefined);
  assert.equal(frontmatter("---\nname: a\ndescription: b\n"), undefined);
});
