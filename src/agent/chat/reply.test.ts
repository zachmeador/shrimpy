import assert from "node:assert/strict";
import { test } from "node:test";
import { clip, inParts } from "./reply.ts";

test("longer text is split into parts that each fit and together hold all of it, at a line break when one falls in the later half", () => {
  assert.deepEqual(inParts("0123456789", 10), ["0123456789"]);
  const text = "first line here\nsecond line is longer than the rest\nthird";
  const parts = inParts(text, 25);

  assert.equal(parts[0], "first line here\n");
  assert.equal(parts.join(""), text);
  for (const part of parts) assert.ok(part.length <= 25, part);
});

test("a character that takes two code units is never split, and a part with nothing in it is dropped, because chat does not take one", () => {
  const text = "ab😀cd😀ef";
  for (const limit of [2, 3, 4, 5]) {
    const parts = inParts(text, limit);
    assert.equal(parts.join(""), text);
    for (const part of parts) assert.doesNotMatch(part, /[\ud800-\udbff]$|^[\udc00-\udfff]/, JSON.stringify(part));
  }
  assert.deepEqual(inParts(`${"a".repeat(10)}${"\n".repeat(10)}b`, 10), ["a".repeat(10), "b"]);
});

test("a reason that is too long is cut with an ellipsis, and not through a character", () => {
  assert.equal(clip("short", 10), "short");
  assert.equal(clip("0123456789A", 10), "012345678…");
  assert.equal(clip("0123456😀89", 9), "0123456…");
});
