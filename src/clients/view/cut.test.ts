import assert from "node:assert/strict";
import { test } from "node:test";
import { lastLines } from "./cut.ts";

test("a line of megabytes is cut to the last characters asked for, and the last lines of what is left", () => {
  assert.equal(lastLines("a".repeat(1_000_000), 5, 10), "a".repeat(10));
  assert.equal(lastLines("one\ntwo\nthree\nfour", 2, 12), "three\nfour");
  assert.equal(lastLines("a\nb\nc\nd\n", 2), "c\nd\n");
});
