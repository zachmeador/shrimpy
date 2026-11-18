import assert from "node:assert/strict";
import { test } from "node:test";
import { cutEnd, cutStart } from "./index.ts";

test("a text that is too long is cut with its ending, and not through a character", () => {
  assert.equal(cutEnd("short", 10, { ending: "…" }), "short");
  assert.equal(cutEnd("0123456789A", 10, { ending: "…" }), "012345678…");
  assert.equal(cutEnd("0123456😀89", 9, { ending: "…" }), "0123456…");
  assert.equal(cutStart("ab😀cd", 3), "cd");
  assert.equal(cutEnd("😀😀😀", 2, { unit: "characters" }), "😀😀");
});
