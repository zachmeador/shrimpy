import assert from "node:assert/strict";
import { test } from "node:test";
import { clip, inParts, readFinalText } from "./reply.ts";

test("END counts when it is wrapped in whitespace, quotes, backticks or asterisks, or ends with a period, and so does nothing at all", () => {
  for (const form of ["END", " END ", '"END"', "“END”", "`END`", "**END**", "END.", " `END`. ", "", "\n\n"]) {
    assert.deepEqual(readFinalText(form), { kind: "silent" }, JSON.stringify(form));
  }
});

test("text that only mentions END, or says something near it, is a reply", () => {
  for (const text of ["END of story", "The END", "end", "END!", "ENDING"]) {
    assert.deepEqual(readFinalText(text), { kind: "reply", text }, JSON.stringify(text));
  }
});

test("text whose last line is END is posted without that line, and an END line before the last is left where it is", () => {
  assert.deepEqual(readFinalText("Done for today.\nEND"), { kind: "reply", text: "Done for today." });
  assert.deepEqual(readFinalText("Done for today.\n\n`END`.\n"), { kind: "reply", text: "Done for today." });
  assert.deepEqual(readFinalText("one\nEND\ntwo"), { kind: "reply", text: "one\nEND\ntwo" });
  assert.deepEqual(readFinalText("Hello\nEND\nEND"), { kind: "reply", text: "Hello\nEND" });
});

test("a reply is posted without the blank lines before it or the whitespace after it, and keeps its first line's indent", () => {
  assert.deepEqual(readFinalText("\n\nI'm working in the home.\n"), { kind: "reply", text: "I'm working in the home." });
  assert.deepEqual(readFinalText("  \n\t\r\n    indented code\nmore   \n\n"), { kind: "reply", text: "    indented code\nmore" });
});

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
